import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createAdapter(): PrismaPg {
  return new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://relationship:relationship@localhost:5432/relationship",
  });
}

let prismaClient: PrismaClient | undefined;

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: createAdapter(),
  });
}

export function getPrismaClient(): PrismaClient {
  prismaClient ??= createPrismaClient();
  return prismaClient;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = undefined;
}
