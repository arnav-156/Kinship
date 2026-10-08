import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@relationship/db";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { canPerformWorkspaceAction } from "@relationship/policy";

import { PRISMA_CLIENT } from "../database/prisma.token";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditInput {
  actorUserId?: string;
  eventType: string;
  metadata?: Prisma.InputJsonValue;
  subjectId?: string;
  subjectType?: string;
  tenantId: string;
  workspaceId?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async record(input: AuditInput, db: Db = this.prisma) {
    return db.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        eventType: input.eventType,
        metadata: input.metadata ?? {},
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      },
    });
  }

  async listForPrincipal(principal: AuthenticatedPrincipal, workspaceId?: string) {
    if (workspaceId) {
      this.assertCanReadWorkspaceAudit(principal, workspaceId);
    } else if (
      !principal.workspaceRoles.some((membership) =>
        canPerformWorkspaceAction(membership.role, "audit:read"),
      )
    ) {
      throw new ForbiddenException("Audit access requires an audit-capable workspace role");
    }

    return this.prisma.auditEvent.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
      where: {
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
  }

  private assertCanReadWorkspaceAudit(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
  ): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "audit:read")) {
      throw new ForbiddenException("You do not have audit access to this workspace");
    }
  }
}
