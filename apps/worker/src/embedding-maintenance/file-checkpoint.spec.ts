import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileEmbeddingCheckpointStore } from "./file-checkpoint";
import type { EmbeddingCheckpoint } from "./index";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("FileEmbeddingCheckpointStore", () => {
  it("atomically persists and replaces resumable checkpoints", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "embedding-checkpoint-"));
    temporaryDirectories.push(directory);
    const checkpointPath = path.join(directory, "nested", "checkpoint.json");
    const store = new FileEmbeddingCheckpointStore(checkpointPath);

    expect(await store.load()).toBeUndefined();
    await store.save(checkpoint("running", 1));
    await store.save(checkpoint("paused", 2));

    expect(await store.load()).toMatchObject({ status: "paused", totalProcessed: 2 });
    expect(fs.readdirSync(path.dirname(checkpointPath))).toEqual(["checkpoint.json"]);
  });
});

function checkpoint(
  status: EmbeddingCheckpoint["status"],
  totalProcessed: number,
): EmbeddingCheckpoint {
  return {
    batchSize: 25,
    expectedDimensions: 1536,
    mode: "backfill",
    model: "text-embedding-3-small",
    schemaVersion: 1,
    startedAt: "2026-07-01T12:00:00.000Z",
    status,
    totalProcessed,
    updatedAt: "2026-07-01T12:01:00.000Z",
  };
}
