import { loadConfig } from "@relationship/config";
import { disconnectPrismaClient, getPrismaClient } from "@relationship/db";
import { createLogger } from "@relationship/logger";

import { ConnectorRefreshScheduler } from "./connector-refresh-scheduler";
import { RetentionScheduler } from "./retention-scheduler";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("scheduler", config.LOG_LEVEL);
  const prisma = getPrismaClient();
  const retentionScheduler = new RetentionScheduler(prisma, {
    intervalMs: config.SCHEDULER_INTERVAL_MS,
    onError: (error) => {
      logger.error("Scheduled retention sweep failed", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    },
  });
  const connectorRefreshScheduler = new ConnectorRefreshScheduler(prisma, {
    intervalMs: config.SCHEDULER_INTERVAL_MS,
    onError: (error) => {
      logger.error("Scheduled connector refresh scan failed", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    },
  });
  let initialRetention;
  let initialConnectorRefresh;
  try {
    [initialRetention, initialConnectorRefresh] = await Promise.all([
      retentionScheduler.start(),
      connectorRefreshScheduler.start(),
    ]);
  } catch (error) {
    await Promise.allSettled([retentionScheduler.stop(), connectorRefreshScheduler.stop()]);
    await disconnectPrismaClient();
    throw error;
  }
  logger.info("Scheduler started", {
    connectorAccountsScanned: initialConnectorRefresh.accountsScanned,
    connectorAccountsSkipped: initialConnectorRefresh.accountsSkipped,
    connectorJobsQueued: initialConnectorRefresh.jobsQueued,
    intervalMs: config.SCHEDULER_INTERVAL_MS,
    retentionJobsQueued: initialRetention.jobsQueued,
    retentionPoliciesCreated: initialRetention.policiesCreated,
    retentionPoliciesScanned: initialRetention.policiesScanned,
    retentionWorkspacesSkipped: initialRetention.workspacesSkipped,
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    await Promise.allSettled([retentionScheduler.stop(), connectorRefreshScheduler.stop()]);
    await disconnectPrismaClient();
    logger.info("Scheduler stopped", { signal });
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((error: unknown) => {
  createLogger("scheduler").error("Scheduler failed to start", {
    error: error instanceof Error ? error : new Error(String(error)),
  });
  process.exitCode = 1;
});
