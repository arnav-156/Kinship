import type { Prisma, PrismaClient, RelationshipStage } from "@prisma/client";

import type { TenantWorkspaceScope } from "./scope";
import { tenantWorkspaceWhere } from "./scope";

type Db = PrismaClient | Prisma.TransactionClient;

export class ProspectListRepository {
  constructor(private readonly db: Db) {}

  create(scope: TenantWorkspaceScope, name: string, description?: string) {
    return this.db.prospectList.create({
      data: {
        ...tenantWorkspaceWhere(scope),
        description,
        name,
      },
    });
  }

  addMember(
    scope: TenantWorkspaceScope,
    prospectListId: string,
    entityId: string,
    relationshipStage: RelationshipStage = "unknown",
  ) {
    return this.db.prospectListMember.create({
      data: {
        ...tenantWorkspaceWhere(scope),
        entityId,
        prospectListId,
        relationshipStage,
      },
    });
  }

  list(scope: TenantWorkspaceScope, take = 50) {
    return this.db.prospectList.findMany({
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
