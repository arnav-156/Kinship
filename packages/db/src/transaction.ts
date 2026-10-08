import type { Prisma, PrismaClient } from "@prisma/client";

export interface TransactionRunner {
  runInTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly prisma: PrismaClient) {}

  runInTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(operation);
  }
}
