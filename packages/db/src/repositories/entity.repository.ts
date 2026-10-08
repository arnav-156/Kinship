import type { EntityType, Prisma, PrismaClient } from "@prisma/client";

import type { TenantWorkspaceScope } from "./scope";
import { tenantWorkspaceWhere } from "./scope";

type Db = PrismaClient | Prisma.TransactionClient;

export interface CreateEntityInput {
  canonicalName: string;
  confidenceScore?: number;
  description?: string;
  type: EntityType;
}

export class EntityRepository {
  constructor(private readonly db: Db) {}

  create(scope: TenantWorkspaceScope, input: CreateEntityInput) {
    return this.db.entity.create({
      data: {
        ...tenantWorkspaceWhere(scope),
        canonicalName: input.canonicalName,
        confidenceScore: input.confidenceScore,
        description: input.description,
        type: input.type,
      },
    });
  }

  findById(scope: TenantWorkspaceScope, entityId: string) {
    return this.db.entity.findFirst({
      where: {
        ...tenantWorkspaceWhere(scope),
        deletedAt: null,
        id: entityId,
      },
    });
  }

  listByWorkspace(scope: TenantWorkspaceScope, take = 50) {
    return this.db.entity.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take,
      where: {
        ...tenantWorkspaceWhere(scope),
        deletedAt: null,
      },
    });
  }
}
