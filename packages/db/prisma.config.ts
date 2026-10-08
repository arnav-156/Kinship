import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
    url:
      process.env.DATABASE_URL ??
      "postgresql://relationship:relationship@localhost:5432/relationship",
  },
  migrations: {
    path: "prisma/migrations",
    seed: "corepack pnpm --filter @relationship/db prisma:seed",
  },
  schema: "prisma/schema.prisma",
});
