import { z } from "zod";

const booleanFromString = z
  .string()
  .optional()
  .transform((value) => value === "true");

const commaSeparatedList = z
  .string()
  .optional()
  .default("")
  .transform((value) =>
    value
      ? value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
  );

const envSchema = z
  .object({
    AI_PROVIDER: z.enum(["mock", "openai-compatible"]).default("mock"),
    AI_FALLBACK_PROVIDER: z.enum(["openai-compatible"]).optional(),
    AI_FALLBACK_API_KEY: z.string().min(1).optional(),
    AI_FALLBACK_BASE_URL: z.string().url().optional(),
    AI_FALLBACK_CHAT_MODEL: z.string().min(1).optional(),
    AI_FALLBACK_EMBEDDING_MODEL: z.string().min(1).optional(),
    API_CORS_ORIGIN: commaSeparatedList,
    API_HOST: z.string().default("0.0.0.0"),
    API_PORT: z.coerce.number().int().positive().default(7000),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(24),
    JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    OPENAI_CHAT_MODEL: z.string().default("gpt-4.1-mini"),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    RATE_LIMIT_MAX: z.coerce.number().int().nonnegative().default(120),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    REDIS_URL: z.string().url(),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.string().url(),
    S3_FORCE_PATH_STYLE: booleanFromString.default("true"),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
    WEB_PORT: z.coerce.number().int().positive().default(3000),
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
    WORKER_LEASE_MS: z.coerce.number().int().positive().default(30_000),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  })
  .superRefine((value, context) => {
    if (value.AI_FALLBACK_PROVIDER && !value.AI_FALLBACK_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI_FALLBACK_API_KEY is required when AI_FALLBACK_PROVIDER is configured",
        path: ["AI_FALLBACK_API_KEY"],
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(source);
}

export function loadConfigResult(source: NodeJS.ProcessEnv = process.env) {
  return envSchema.safeParse(source);
}
