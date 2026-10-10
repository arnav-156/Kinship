import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import {
  contentHash,
  S3ObjectStorage,
  snapshotObjectKey,
  verifiedSnapshotObjectKeys,
} from "./index";

const body = new TextEncoder().encode("immutable source body");
const hash = contentHash(body);
const input = {
  body,
  contentHash: hash,
  contentType: "text/plain; charset=utf-8",
  policyStatus: "allowed",
  retentionExpiresAt: new Date("2027-10-08T10:00:00.000Z"),
  retrievalTimestamp: new Date("2026-10-08T10:00:00.000Z"),
  sourceType: "github",
  tenantId: "tenant_1",
  workspaceId: "workspace_1",
};
const options = {
  accessKeyId: "access",
  bucket: "snapshots",
  endpoint: "http://localhost:9000",
  forcePathStyle: true,
  region: "us-east-1",
  secretAccessKey: "secret",
};

describe("S3ObjectStorage", () => {
  it("writes a content-addressed snapshot exactly once with lifecycle metadata", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new S3ObjectStorage(options, { send });

    await expect(storage.putSnapshot(input)).resolves.toEqual({
      contentHash: hash,
      contentType: input.contentType,
      created: true,
      key: snapshotObjectKey(input),
      sizeBytes: body.byteLength,
    });

    const command = send.mock.calls[0]![0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Body: body,
      Bucket: "snapshots",
      ContentLength: body.byteLength,
      ContentType: input.contentType,
      IfNoneMatch: "*",
      Key: snapshotObjectKey(input),
      Metadata: {
        "content-hash": hash,
        "lifecycle-version": "1",
        "policy-status": "allowed",
        "retention-expires-at": "2027-10-08T10:00:00.000Z",
        "retrieval-timestamp": "2026-10-08T10:00:00.000Z",
        "source-type": "github",
        "tenant-id": "tenant_1",
        "workspace-id": "workspace_1",
      },
    });
  });

  it("treats an identical pre-existing object as an idempotent replay", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 }, name: "PreconditionFailed" })
      .mockResolvedValueOnce({
        ContentLength: body.byteLength,
        ContentType: input.contentType,
        Metadata: { "content-hash": hash },
      });
    const storage = new S3ObjectStorage(options, { send });

    await expect(storage.putSnapshot(input)).resolves.toMatchObject({ created: false });
    expect(send.mock.calls[1]![0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("rejects connector content that does not match its declared hash", async () => {
    const send = vi.fn();
    const storage = new S3ObjectStorage(options, { send });

    await expect(
      storage.putSnapshot({ ...input, contentHash: `sha256:${"0".repeat(64)}` }),
    ).rejects.toThrow("Source snapshot hash mismatch");
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a create-only collision whose stored metadata differs", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce({ name: "PreconditionFailed" })
      .mockResolvedValueOnce({
        ContentLength: body.byteLength + 1,
        ContentType: input.contentType,
        Metadata: { "content-hash": hash },
      });
    const storage = new S3ObjectStorage(options, { send });

    await expect(storage.putSnapshot(input)).rejects.toThrow("Immutable source snapshot conflict");
  });

  it("reads and deletes objects by key", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Body: { transformToByteArray: vi.fn().mockResolvedValue(body) } })
      .mockResolvedValueOnce({});
    const storage = new S3ObjectStorage(options, { send });

    await expect(storage.getObject("snapshot/key")).resolves.toEqual(body);
    await expect(storage.deleteObject("snapshot/key")).resolves.toBeUndefined();
    expect(send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[1]![0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it("checks configured bucket availability", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new S3ObjectStorage(options, { send });

    await expect(storage.checkHealth()).resolves.toBeUndefined();
    expect(send.mock.calls[0]![0]).toBeInstanceOf(HeadBucketCommand);
  });
});

describe("verifiedSnapshotObjectKeys", () => {
  it("rejects a database key that does not match the snapshot tenant scope and hash", () => {
    expect(() =>
      verifiedSnapshotObjectKeys([{ rawContentHash: hash, storageKey: snapshotObjectKey(input) }], {
        tenantId: "tenant_2",
        workspaceId: "workspace_1",
      }),
    ).toThrow("outside its tenant/workspace scope");
  });
});
