import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface StoredObject {
  contentHash: string;
  contentType: string;
  created: boolean;
  key: string;
  sizeBytes: number;
}

export interface SnapshotLifecycleMetadata {
  contentHash: string;
  contentType: string;
  policyStatus: string;
  retentionExpiresAt: Date | null;
  retrievalTimestamp: Date;
  sourceType: string;
  tenantId: string;
  workspaceId: string;
}

export interface PutSnapshotInput extends SnapshotLifecycleMetadata {
  body: Uint8Array;
}

export interface ObjectStoragePort {
  checkHealth(): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
  putSnapshot(input: PutSnapshotInput): Promise<StoredObject>;
}

export interface S3ObjectStorageOptions {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  region: string;
  secretAccessKey: string;
}

interface CommandClient {
  send(command: object): Promise<unknown>;
}

interface HeadObjectResult {
  ContentLength?: number;
  ContentType?: string;
  Metadata?: Record<string, string>;
}

interface GetObjectResult {
  Body?: {
    transformToByteArray(): Promise<Uint8Array>;
  };
}

export class S3ObjectStorage implements ObjectStoragePort {
  constructor(
    private readonly options: S3ObjectStorageOptions,
    private readonly client: CommandClient = new S3Client({
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      region: options.region,
    }) as CommandClient,
  ) {}

  async putSnapshot(input: PutSnapshotInput): Promise<StoredObject> {
    const actualHash = contentHash(input.body);
    if (actualHash !== input.contentHash) {
      throw new Error(
        `Source snapshot hash mismatch: connector supplied ${input.contentHash}, calculated ${actualHash}`,
      );
    }

    const key = snapshotObjectKey(input);
    const metadata: Record<string, string> = {
      "content-hash": input.contentHash,
      "lifecycle-version": "1",
      "policy-status": input.policyStatus,
      "retrieval-timestamp": input.retrievalTimestamp.toISOString(),
      "source-type": input.sourceType,
      "tenant-id": input.tenantId,
      "workspace-id": input.workspaceId,
    };
    if (input.retentionExpiresAt) {
      metadata["retention-expires-at"] = input.retentionExpiresAt.toISOString();
    }

    try {
      await this.client.send(
        new PutObjectCommand({
          Body: input.body,
          Bucket: this.options.bucket,
          ChecksumSHA256: Buffer.from(input.contentHash.slice("sha256:".length), "hex").toString(
            "base64",
          ),
          ContentLength: input.body.byteLength,
          ContentType: input.contentType,
          IfNoneMatch: "*",
          Key: key,
          Metadata: metadata,
        }),
      );
      return storedObject(input, key, true);
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
    }

    const existing = (await this.client.send(
      new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
    )) as HeadObjectResult;
    if (
      existing.ContentLength !== input.body.byteLength ||
      existing.ContentType !== input.contentType ||
      existing.Metadata?.["content-hash"] !== input.contentHash
    ) {
      throw new Error(`Immutable source snapshot conflict at ${key}`);
    }
    return storedObject(input, key, false);
  }

  async checkHealth(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
  }

  async getObject(key: string): Promise<Uint8Array> {
    const result = (await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    )) as GetObjectResult;
    if (!result.Body) throw new Error(`Stored object ${key} has no body`);
    return result.Body.transformToByteArray();
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }
}

export function createS3ObjectStorage(options: S3ObjectStorageOptions): ObjectStoragePort {
  return new S3ObjectStorage(options);
}

export function contentHash(body: Uint8Array): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

export function snapshotObjectKey(
  metadata: Pick<SnapshotLifecycleMetadata, "contentHash" | "tenantId" | "workspaceId">,
): string {
  const digest = metadata.contentHash.match(/^sha256:([a-f0-9]{64})$/)?.[1];
  if (!digest) throw new Error(`Invalid source snapshot hash: ${metadata.contentHash}`);
  const tenantScope = Buffer.from(metadata.tenantId, "utf8").toString("base64url");
  const workspaceScope = Buffer.from(metadata.workspaceId, "utf8").toString("base64url");
  return `source-snapshots/v1/${tenantScope}/${workspaceScope}/${digest}`;
}

export function verifiedSnapshotObjectKeys(
  snapshots: Array<{ rawContentHash: string; storageKey: null | string }>,
  scope: { tenantId: string; workspaceId: string },
): string[] {
  const keys = snapshots.flatMap((snapshot) => {
    if (!snapshot.storageKey) return [];
    const expected = snapshotObjectKey({
      contentHash: snapshot.rawContentHash,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    });
    if (snapshot.storageKey !== expected) {
      throw new Error(`Source snapshot storage key is outside its tenant/workspace scope`);
    }
    return [snapshot.storageKey];
  });
  return [...new Set(keys)];
}

function storedObject(input: PutSnapshotInput, key: string, created: boolean): StoredObject {
  return {
    contentHash: input.contentHash,
    contentType: input.contentType,
    created,
    key,
    sizeBytes: input.body.byteLength,
  };
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { $metadata?: { httpStatusCode?: number }; name?: string };
  return candidate.name === "PreconditionFailed" || candidate.$metadata?.httpStatusCode === 412;
}
