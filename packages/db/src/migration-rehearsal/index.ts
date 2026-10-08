import { join } from "node:path";

export const MIGRATION_REHEARSAL_CONFIRMATION = "REHEARSE MIGRATIONS IN A DISPOSABLE DATABASE";

const DEFAULT_IMAGE = "pgvector/pgvector:pg16";
const DATABASE_USER = "rehearsal";
const CLEAN_DATABASE = "relationship_rehearsal";
const UPGRADE_DATABASE = "relationship_upgrade";

export interface MigrationSource {
  name: string;
  sql: string;
}

export interface CompatibilityRisk {
  approved: boolean;
  migration: string;
  rule:
    | "delete-data"
    | "drop-column"
    | "drop-table"
    | "rename-object"
    | "set-not-null"
    | "truncate-table";
  statement: string;
}

export interface CommandRequest {
  allowFailure?: boolean;
  args: string[];
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
}

export interface CommandResult {
  exitCode?: number;
  stderr: string;
  stdout: string;
}

export interface MigrationRehearsalDependencies {
  command(request: CommandRequest): Promise<CommandResult>;
  image?: string;
  migrations: MigrationSource[];
  password: string;
  projectRoot: string;
  runId: string;
  sleep(milliseconds: number): Promise<void>;
}

export interface MigrationRehearsalReport {
  compatibilityRisks: CompatibilityRisk[];
  containerName: string;
  databases: {
    cleanDeploy: "compatible";
    orderedUpgrade: "compatible";
  };
  latestMigration: string;
  migrationCount: number;
  status: "passed";
}

const RISK_RULES: Array<{
  pattern: RegExp;
  rule: CompatibilityRisk["rule"];
}> = [
  { pattern: /\bDROP\s+COLUMN\b/i, rule: "drop-column" },
  { pattern: /\bDROP\s+TABLE\b/i, rule: "drop-table" },
  { pattern: /\bTRUNCATE(?:\s+TABLE)?\b/i, rule: "truncate-table" },
  { pattern: /\bDELETE\s+FROM\b/i, rule: "delete-data" },
  {
    pattern: /\bALTER\s+COLUMN\b[\s\S]*?\bSET\s+NOT\s+NULL\b/i,
    rule: "set-not-null",
  },
  {
    pattern: /\bRENAME\s+(?:COLUMN|TABLE|TO)\b/i,
    rule: "rename-object",
  },
];

export function analyzeMigrationCompatibility(migrations: MigrationSource[]): CompatibilityRisk[] {
  return migrations.flatMap((migration) => {
    const approved = migration.sql.includes("-- rehearsal: allow-destructive");
    return RISK_RULES.flatMap(({ pattern, rule }) => {
      const match = migration.sql.match(pattern);
      return match
        ? [
            {
              approved,
              migration: migration.name,
              rule,
              statement: statementContaining(migration.sql, match.index ?? 0),
            },
          ]
        : [];
    });
  });
}

export function parseLoopbackDockerPort(output: string): number {
  const match = output.trim().match(/^127\.0\.0\.1:(\d+)$/);
  const port = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Disposable PostgreSQL must be loopback-bound; received "${output.trim()}"`);
  }
  return port;
}

export class MigrationRehearsalRunner {
  private readonly containerName: string;
  private readonly image: string;
  private readonly migrations: MigrationSource[];

  constructor(private readonly dependencies: MigrationRehearsalDependencies) {
    this.containerName = `relationship-migration-rehearsal-${sanitizeRunId(dependencies.runId)}`;
    this.image = dependencies.image ?? DEFAULT_IMAGE;
    this.migrations = [...dependencies.migrations].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async execute(confirmation: string): Promise<MigrationRehearsalReport> {
    if (confirmation !== MIGRATION_REHEARSAL_CONFIRMATION) {
      throw new Error(`Confirmation must exactly match "${MIGRATION_REHEARSAL_CONFIRMATION}"`);
    }
    if (this.migrations.length === 0) {
      throw new Error("No migration.sql files were found for rehearsal");
    }

    const compatibilityRisks = analyzeMigrationCompatibility(this.migrations);
    const unapprovedRisks = compatibilityRisks.filter((risk) => !risk.approved);
    if (unapprovedRisks.length > 0) {
      throw new Error(
        `Migration compatibility review found unapproved destructive SQL: ${unapprovedRisks
          .map((risk) => `${risk.migration}:${risk.rule}`)
          .join(", ")}`,
      );
    }

    let containerStarted = false;
    try {
      await this.startContainer();
      containerStarted = true;
      const port = await this.resolvePort();
      await this.waitUntilReady();
      await this.createUpgradeDatabase();
      await this.rehearseCleanDeploy(port);
      await this.rehearseOrderedUpgrade(port);

      return {
        compatibilityRisks,
        containerName: this.containerName,
        databases: {
          cleanDeploy: "compatible",
          orderedUpgrade: "compatible",
        },
        latestMigration: this.migrations.at(-1)?.name ?? "",
        migrationCount: this.migrations.length,
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
        POSTGRES_DB: CLEAN_DATABASE,
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
          CLEAN_DATABASE,
        ],
        command: "docker",
      });
      if ((result.exitCode ?? 0) === 0) return;
      await this.dependencies.sleep(500);
    }
    throw new Error("Disposable PostgreSQL did not become ready within 30 seconds");
  }

  private async createUpgradeDatabase(): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = await this.dependencies.command({
        allowFailure: true,
        args: [
          "exec",
          this.containerName,
          "createdb",
          "--username",
          DATABASE_USER,
          UPGRADE_DATABASE,
        ],
        command: "docker",
      });
      if ((result.exitCode ?? 0) === 0 || result.stderr.includes("already exists")) {
        return;
      }
      await this.dependencies.sleep(500);
    }
    throw new Error("Could not create the ordered-upgrade database within 30 seconds");
  }

  private async rehearseCleanDeploy(port: number): Promise<void> {
    await this.runPrisma("deploy", CLEAN_DATABASE, port);
    await this.runPrisma("diff", CLEAN_DATABASE, port);
  }

  private async rehearseOrderedUpgrade(port: number): Promise<void> {
    for (const migration of this.migrations) {
      await this.dependencies.command({
        args: [
          "exec",
          "--interactive",
          this.containerName,
          "psql",
          "--set",
          "ON_ERROR_STOP=1",
          "--username",
          DATABASE_USER,
          "--dbname",
          UPGRADE_DATABASE,
        ],
        command: "docker",
        input: migration.sql,
      });
    }
    await this.runPrisma("diff", UPGRADE_DATABASE, port);
  }

  private async runPrisma(
    operation: "deploy" | "diff",
    database: string,
    port: number,
  ): Promise<void> {
    const prismaCli = join(
      this.dependencies.projectRoot,
      "packages",
      "db",
      "node_modules",
      "prisma",
      "build",
      "index.js",
    );
    const config = join(this.dependencies.projectRoot, "packages", "db", "prisma.config.ts");
    const args =
      operation === "deploy"
        ? [prismaCli, "migrate", "deploy", "--config", config]
        : [
            prismaCli,
            "migrate",
            "diff",
            "--from-config-datasource",
            "--to-schema",
            join(this.dependencies.projectRoot, "packages", "db", "prisma", "schema.prisma"),
            "--exit-code",
            "--config",
            config,
          ];
    await this.dependencies.command({
      args,
      command: process.execPath,
      cwd: this.dependencies.projectRoot,
      env: {
        DATABASE_URL: databaseUrl(database, port, this.dependencies.password),
      },
    });
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
  if (!sanitized) throw new Error("Migration rehearsal run ID is empty");
  return sanitized.slice(0, 40);
}

function statementContaining(sql: string, index: number): string {
  const start = sql.lastIndexOf(";", index) + 1;
  const endIndex = sql.indexOf(";", index);
  const end = endIndex >= 0 ? endIndex + 1 : sql.length;
  return sql.slice(start, end).trim().replace(/\s+/g, " ");
}
