import { join } from "node:path";

import {
  type CommandRequest,
  type CommandResult,
  parseLoopbackDockerPort,
} from "../migration-rehearsal";

export const BACKUP_VERIFICATION_CONFIRMATION = "VERIFY BACKUP RESTORE IN A DISPOSABLE DATABASE";

const DEFAULT_IMAGE = "pgvector/pgvector:pg16";
const DATABASE_USER = "backup_verifier";
const SOURCE_DATABASE = "relationship_backup_source";
const RESTORED_DATABASE = "relationship_backup_restored";
const ARCHIVE_PATH = "/tmp/relationship-backup.dump";
const CANARY_ID = "backup-canary-tenant";

const CANARY_INSERT_SQL = `
INSERT INTO "tenants" (
  "id", "name", "slug", "default_region", "updated_at", "is_demo"
) VALUES (
  '${CANARY_ID}',
  'Backup Canary (Synthetic)',
  'backup-canary.invalid',
  'ZZ',
  '2026-07-30T00:00:00.000Z',
  true
);
`;

const CANARY_FINGERPRINT_SQL = `
SELECT md5(concat_ws(
  '|',
  "id",
  "name",
  "slug",
  COALESCE("default_region", ''),
  "is_demo"::text
))
FROM "tenants"
WHERE "id" = '${CANARY_ID}';
`;

export interface BackupVerificationDependencies {
  command(request: CommandRequest): Promise<CommandResult>;
  image?: string;
  password: string;
  projectRoot: string;
  runId: string;
  sleep(milliseconds: number): Promise<void>;
}

export interface BackupVerificationReport {
  archive: {
    bytes: number;
    format: "custom";
    sha256: string;
  };
  canary: {
    matches: true;
    restoredFingerprint: string;
    sourceFingerprint: string;
  };
  containerName: string;
  databases: {
    restored: "schema-and-data-compatible";
    source: "migrated-and-backed-up";
  };
  status: "passed";
}

export class BackupRestorationVerifier {
  private readonly containerName: string;
  private readonly image: string;

  constructor(private readonly dependencies: BackupVerificationDependencies) {
    this.containerName = `relationship-backup-verification-${sanitizeRunId(dependencies.runId)}`;
    this.image = dependencies.image ?? DEFAULT_IMAGE;
  }

  async execute(confirmation: string): Promise<BackupVerificationReport> {
    if (confirmation !== BACKUP_VERIFICATION_CONFIRMATION) {
      throw new Error(`Confirmation must exactly match "${BACKUP_VERIFICATION_CONFIRMATION}"`);
    }

    let containerStarted = false;
    try {
      await this.startContainer();
      containerStarted = true;
      const port = await this.resolvePort();
      await this.waitUntilReady();
      await this.createRestoredDatabase();
      await this.migrateSource(port);
      await this.seedCanary();
      const sourceFingerprint = await this.readCanaryFingerprint(SOURCE_DATABASE);
      await this.createArchive();
      await this.validateArchive();
      const archive = await this.readArchiveMetadata();
      await this.restoreArchive();
      await this.verifyRestoredSchema(port);
      const restoredFingerprint = await this.readCanaryFingerprint(RESTORED_DATABASE);
      if (sourceFingerprint !== restoredFingerprint) {
        throw new Error(
          `Restored canary fingerprint mismatch: source=${sourceFingerprint} restored=${restoredFingerprint}`,
        );
      }

      return {
        archive: {
          ...archive,
          format: "custom",
        },
        canary: {
          matches: true,
          restoredFingerprint,
          sourceFingerprint,
        },
        containerName: this.containerName,
        databases: {
          restored: "schema-and-data-compatible",
          source: "migrated-and-backed-up",
        },
        status: "passed",
      };
    } finally {
      if (containerStarted) {
        await this.dependencies.command({
          args: ["rm", "--force", this.containerName],
          command: "docker",
        });
      }
    }
  }

  private async startContainer(): Promise<void> {
    await this.dependencies.command({
      args: [
        "run",
        "--detach",
        "--rm",
        "--name",
        this.containerName,
        "--env",
        "POSTGRES_USER",
        "--env",
        "POSTGRES_PASSWORD",
        "--env",
        "POSTGRES_DB",
        "--publish",
        "127.0.0.1::5432",
        this.image,
      ],
      command: "docker",
      env: {
        POSTGRES_DB: SOURCE_DATABASE,
        POSTGRES_PASSWORD: this.dependencies.password,
        POSTGRES_USER: DATABASE_USER,
      },
    });
  }

  private async resolvePort(): Promise<number> {
    const result = await this.dependencies.command({
      args: ["port", this.containerName, "5432/tcp"],
      command: "docker",
    });
    return parseLoopbackDockerPort(result.stdout);
  }

  private async waitUntilReady(): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = await this.dependencies.command({
        allowFailure: true,
        args: [
          "exec",
          this.containerName,
          "pg_isready",
          "--username",
          DATABASE_USER,
          "--dbname",
          SOURCE_DATABASE,
        ],
        command: "docker",
      });
      if ((result.exitCode ?? 0) === 0) return;
      await this.dependencies.sleep(500);
    }
    throw new Error("Disposable PostgreSQL did not become ready within 30 seconds");
  }

  private async createRestoredDatabase(): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = await this.dependencies.command({
        allowFailure: true,
        args: [
          "exec",
          this.containerName,
          "createdb",
          "--username",
          DATABASE_USER,
          RESTORED_DATABASE,
        ],
        command: "docker",
      });
      if ((result.exitCode ?? 0) === 0 || result.stderr.includes("already exists")) {
        return;
      }
      await this.dependencies.sleep(500);
    }
    throw new Error("Could not create the restored database within 30 seconds");
  }

  private async migrateSource(port: number): Promise<void> {
    await this.runPrisma(["migrate", "deploy"], SOURCE_DATABASE, port);
  }

  private async verifyRestoredSchema(port: number): Promise<void> {
    await this.runPrisma(
      [
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        this.schemaPath(),
        "--exit-code",
      ],
      RESTORED_DATABASE,
      port,
    );
  }

  private async runPrisma(
    prismaArguments: string[],
    database: string,
    port: number,
  ): Promise<void> {
    await this.dependencies.command({
      args: [this.prismaCliPath(), ...prismaArguments, "--config", this.prismaConfigPath()],
      command: process.execPath,
      cwd: this.dependencies.projectRoot,
      env: {
        DATABASE_URL: databaseUrl(database, port, this.dependencies.password),
      },
    });
  }

  private async seedCanary(): Promise<void> {
    await this.runPsql(SOURCE_DATABASE, CANARY_INSERT_SQL);
  }

  private async readCanaryFingerprint(database: string): Promise<string> {
    const result = await this.runPsql(database, CANARY_FINGERPRINT_SQL, true);
    const fingerprint = result.stdout.trim();
    if (!/^[a-f0-9]{32}$/.test(fingerprint)) {
      throw new Error(`Canary fingerprint query returned an invalid value for ${database}`);
    }
    return fingerprint;
  }

  private async runPsql(database: string, sql: string, tuplesOnly = false): Promise<CommandResult> {
    const args = [
      "exec",
      this.containerName,
      "psql",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      DATABASE_USER,
      "--dbname",
      database,
    ];
    if (tuplesOnly) {
      args.push("--tuples-only", "--no-align");
    }
    args.push("--command", sql);
    return this.dependencies.command({ args, command: "docker" });
  }

  private async createArchive(): Promise<void> {
    await this.dependencies.command({
      args: [
        "exec",
        this.containerName,
        "pg_dump",
        "--username",
        DATABASE_USER,
        "--dbname",
        SOURCE_DATABASE,
        "--format",
        "custom",
        "--compress",
        "6",
        "--file",
        ARCHIVE_PATH,
      ],
      command: "docker",
    });
  }

  private async validateArchive(): Promise<void> {
    await this.dependencies.command({
      args: ["exec", this.containerName, "pg_restore", "--list", ARCHIVE_PATH],
      command: "docker",
    });
  }

  private async readArchiveMetadata(): Promise<{
    bytes: number;
    sha256: string;
  }> {
    const sizeResult = await this.dependencies.command({
      args: ["exec", this.containerName, "stat", "--format=%s", ARCHIVE_PATH],
      command: "docker",
    });
    const bytes = Number.parseInt(sizeResult.stdout.trim(), 10);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
      throw new Error("Backup archive is empty or its size is invalid");
    }

    const hashResult = await this.dependencies.command({
      args: ["exec", this.containerName, "sha256sum", ARCHIVE_PATH],
      command: "docker",
    });
    const sha256 = hashResult.stdout.trim().split(/\s+/)[0] ?? "";
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error("Backup archive SHA-256 is invalid");
    }
    return { bytes, sha256 };
  }

  private async restoreArchive(): Promise<void> {
    await this.dependencies.command({
      args: [
        "exec",
        this.containerName,
        "pg_restore",
        "--exit-on-error",
        "--no-owner",
        "--username",
        DATABASE_USER,
        "--dbname",
        RESTORED_DATABASE,
        ARCHIVE_PATH,
      ],
      command: "docker",
    });
  }

  private prismaCliPath(): string {
    return join(
      this.dependencies.projectRoot,
      "packages",
      "db",
      "node_modules",
      "prisma",
      "build",
      "index.js",
    );
  }

  private prismaConfigPath(): string {
    return join(this.dependencies.projectRoot, "packages", "db", "prisma.config.ts");
  }

  private schemaPath(): string {
    return join(this.dependencies.projectRoot, "packages", "db", "prisma", "schema.prisma");
  }
}

function databaseUrl(database: string, port: number, password: string): string {
  return `postgresql://${DATABASE_USER}:${encodeURIComponent(
    password,
  )}@127.0.0.1:${port}/${database}`;
}

function sanitizeRunId(runId: string): string {
  const sanitized = runId
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!sanitized) throw new Error("Backup verification run ID is empty");
  return sanitized.slice(0, 40);
}
