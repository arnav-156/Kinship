import fs from "node:fs";
import path from "node:path";

import type { EmbeddingCheckpoint, EmbeddingCheckpointStore } from "./index";
import { EmbeddingMaintenanceError } from "./index";

export class FileEmbeddingCheckpointStore implements EmbeddingCheckpointStore {
  readonly checkpointPath: string;

  constructor(checkpointPath: string) {
    this.checkpointPath = path.resolve(checkpointPath);
  }

  async load(): Promise<EmbeddingCheckpoint | undefined> {
    if (!fs.existsSync(this.checkpointPath)) {
      return undefined;
    }
    try {
      const value = JSON.parse(fs.readFileSync(this.checkpointPath, "utf8")) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("checkpoint root must be an object");
      }
      return value as EmbeddingCheckpoint;
    } catch (error) {
      throw new EmbeddingMaintenanceError(
        `Could not read checkpoint ${this.checkpointPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async save(checkpoint: EmbeddingCheckpoint): Promise<void> {
    fs.mkdirSync(path.dirname(this.checkpointPath), { recursive: true });
    const temporaryPath = `${this.checkpointPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, this.checkpointPath);
  }
}
