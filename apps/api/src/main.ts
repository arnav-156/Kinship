import "reflect-metadata";

import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadConfig } from "@relationship/config";
import { createLogger } from "@relationship/logger";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { createRateLimitMiddleware } from "./common/rate-limit.middleware";
import { requestIdMiddleware } from "./common/request-id.middleware";

async function bootstrap() {
  const config = loadConfig();
  const logger = createLogger("api", config.LOG_LEVEL);
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.use(helmet());
  app.use(requestIdMiddleware);
  app.enableCors({
    credentials: true,
    origin: getCorsOrigin(config.NODE_ENV, config.API_CORS_ORIGIN),
  });
  app.use(
    createRateLimitMiddleware({
      max: config.RATE_LIMIT_MAX,
      windowMs: config.RATE_LIMIT_WINDOW_MS,
    }),
  );
  app.setGlobalPrefix("v1", {
    exclude: [
      { path: "/", method: RequestMethod.GET },
      { path: "health", method: RequestMethod.GET },
      { path: "ready", method: RequestMethod.GET },
      { path: "metrics", method: RequestMethod.GET },
    ],
  });
  app.useGlobalFilters(new HttpExceptionFilter(config.NODE_ENV));
  app.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();

  await app.listen(config.API_PORT, config.API_HOST);
  logger.info("API started", {
    host: config.API_HOST,
    port: config.API_PORT,
  });
}

function getCorsOrigin(
  nodeEnv: "development" | "test" | "production",
  allowedOrigins: string[],
): boolean | string[] {
  if (allowedOrigins.length > 0) {
    return allowedOrigins;
  }

  return nodeEnv === "production" ? false : true;
}

bootstrap().catch((error: unknown) => {
  createLogger("api").error("API failed to start", {
    error: error instanceof Error ? error : new Error(String(error)),
  });
  process.exitCode = 1;
});
