import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { createLogger } from "@relationship/logger";

import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });

  app.enableShutdownHooks();
}

bootstrap().catch((error: unknown) => {
  createLogger("worker").error("Worker failed to start", {
    error: error instanceof Error ? error : new Error(String(error)),
  });
  process.exitCode = 1;
});
