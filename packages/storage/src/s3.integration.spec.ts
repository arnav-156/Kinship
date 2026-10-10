import { randomUUID } from "node:crypto";

import { CreateBucketCommand, DeleteBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentHash, createS3ObjectStorage } from "./index";

const enabled = process.env["RUN_STORAGE_INTEGRATION"] === "true";
const body = new TextEncoder().encode(`s3-integration-${randomUUID()}`);
const hash = contentHash(body);
const options = {
  accessKeyId: process.env["S3_ACCESS_KEY_ID"] ?? "minioadmin",
  bucket: process.env["S3_BUCKET"] ?? "relationship-local",
  endpoint: process.env["S3_ENDPOINT"] ?? "http://localhost:9000",
  forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] !== "false",
  region: process.env["S3_REGION"] ?? "us-east-1",
  secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"] ?? "minioadmin",
};
const storage = createS3ObjectStorage(options);
const bucketClient = new S3Client({
  credentials: {
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
  },
  endpoint: options.endpoint,
  forcePathStyle: options.forcePathStyle,
  region: options.region,
});
let storedKey: string | undefined;
let createdBucket = false;

describe.runIf(enabled)("S3-compatible snapshot integration", () => {
  beforeAll(async () => {
    try {
      await bucketClient.send(new CreateBucketCommand({ Bucket: options.bucket }));
      createdBucket = true;
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !["BucketAlreadyExists", "BucketAlreadyOwnedByYou"].includes(
          (error as { name?: string }).name ?? "",
        )
      ) {
        throw error;
      }
    }
  });

  afterAll(async () => {
    if (storedKey) await storage.deleteObject(storedKey);
    if (createdBucket) await bucketClient.send(new DeleteBucketCommand({ Bucket: options.bucket }));
    bucketClient.destroy();
  });

  it("creates, replays, reads, and deletes an immutable snapshot", async () => {
    await expect(storage.checkHealth()).resolves.toBeUndefined();
    const input = {
      body,
      contentHash: hash,
      contentType: "text/plain",
      policyStatus: "allowed",
      retentionExpiresAt: new Date("2027-10-08T10:00:00.000Z"),
      retrievalTimestamp: new Date("2026-10-08T10:00:00.000Z"),
      sourceType: "user_url",
      tenantId: `integration-${randomUUID()}`,
      workspaceId: `integration-${randomUUID()}`,
    };

    const created = await storage.putSnapshot(input);
    storedKey = created.key;
    expect(created.created).toBe(true);
    await expect(storage.putSnapshot(input)).resolves.toMatchObject({ created: false });
    await expect(storage.getObject(created.key)).resolves.toEqual(body);

    await storage.deleteObject(created.key);
    storedKey = undefined;
    await expect(storage.getObject(created.key)).rejects.toBeDefined();
  });
});
