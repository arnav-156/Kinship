export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export type LogContext = Record<string, boolean | Error | null | number | string | undefined>;

export interface AppLogger {
  debug(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
}

const severity: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

function normalizeContext(context: LogContext = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      value instanceof Error
        ? {
            message: value.message,
            name: value.name,
            stack: value.stack,
          }
        : value,
    ]),
  );
}

export function createLogger(service: string, level: LogLevel = "info"): AppLogger {
  const threshold = severity[level];

  function write(
    entryLevel: Exclude<LogLevel, "fatal" | "trace">,
    message: string,
    context?: LogContext,
  ) {
    if (severity[entryLevel] < threshold) {
      return;
    }

    const payload = {
      ...normalizeContext(context),
      level: entryLevel,
      message,
      service,
      timestamp: new Date().toISOString(),
    };

    const line = JSON.stringify(payload);
    if (entryLevel === "error") {
      console.error(line);
      return;
    }

    if (entryLevel === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    debug: (message, context) => write("debug", message, context),
    error: (message, context) => write("error", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
  };
}
