import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { PrismaClient } from "@relationship/db";
import { canPerformWorkspaceAction } from "@relationship/policy";
import crypto from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import type { CreateWorkspaceDto, UpdateWorkspaceDto } from "./dto";

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
  ) {}

  async create(principal: AuthenticatedPrincipal, input: CreateWorkspaceDto) {
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: input.name,
          slug: await this.createUniqueWorkspaceSlug(principal.tenantId, input.name),
          tenantId: principal.tenantId,
        },
      });

      await tx.workspaceMembership.create({
        data: {
          role: "owner",
          tenantId: principal.tenantId,
          userId: principal.userId,
          workspaceId: created.id,
        },
      });
      await tx.retentionPolicy.create({
        data: {
          dataClass: "evidence",
          retentionDays: 365,
          tenantId: principal.tenantId,
          workspaceId: created.id,
        },
      });

      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "workspace.created",
          subjectId: created.id,
          subjectType: "workspace",
          tenantId: principal.tenantId,
          workspaceId: created.id,
        },
        tx,
      );

      return created;
    });

    return workspace;
  }

  list(principal: AuthenticatedPrincipal) {
    const workspaceIds = principal.workspaceRoles.map((membership) => membership.workspaceId);

    return this.prisma.workspace.findMany({
      orderBy: {
        createdAt: "desc",
      },
      where: {
        deletedAt: null,
        id: {
          in: workspaceIds,
        },
        tenantId: principal.tenantId,
      },
    });
  }

  async get(principal: AuthenticatedPrincipal, workspaceId: string) {
    this.assertCanRead(principal, workspaceId);
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        deletedAt: null,
        id: workspaceId,
        tenantId: principal.tenantId,
      },
    });

    if (!workspace) {
      throw new NotFoundException("Workspace was not found");
    }

    return workspace;
  }

  async update(principal: AuthenticatedPrincipal, workspaceId: string, input: UpdateWorkspaceDto) {
    this.assertCanManage(principal, workspaceId);
    const existing = await this.get(principal, workspaceId);
    const updated = await this.prisma.workspace.update({
      data: {
        name: input.name ?? existing.name,
      },
      where: {
        id: workspaceId,
      },
    });

    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "workspace.updated",
      subjectId: workspaceId,
      subjectType: "workspace",
      tenantId: principal.tenantId,
      workspaceId,
    });

    return updated;
  }

  private assertCanRead(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "workspace:read")) {
      throw new ForbiddenException("You do not have access to this workspace");
    }
  }

  private assertCanManage(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "workspace:manage")) {
      throw new ForbiddenException("You cannot manage this workspace");
    }
  }

  private async createUniqueWorkspaceSlug(tenantId: string, name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${crypto.randomBytes(3).toString("hex")}`;
      const existing = await this.prisma.workspace.findUnique({
        where: {
          tenantId_slug: {
            slug,
            tenantId,
          },
        },
      });

      if (!existing) {
        return slug;
      }
    }

    return `${base}-${crypto.randomBytes(6).toString("hex")}`;
  }
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : `workspace-${crypto.randomBytes(3).toString("hex")}`;
}
