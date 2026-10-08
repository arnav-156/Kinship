import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { PrismaClient } from "@relationship/db";
import crypto from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import type { AuthResponseDto, LoginDto, RegisterDto } from "./dto";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async register(input: RegisterDto): Promise<AuthResponseDto> {
    const email = input.email.trim().toLowerCase();
    const tenantSlug = await this.createUniqueTenantSlug(input.tenantName);
    const workspaceSlug = slugify(input.workspaceName);
    const passwordHash = await this.passwordService.hashPassword(input.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          defaultRegion: input.region,
          name: input.tenantName,
          slug: tenantSlug,
        },
      });

      const user = await tx.user.create({
        data: {
          displayName: input.displayName,
          email,
          passwordHash,
          region: input.region,
          tenantId: tenant.id,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: input.workspaceName,
          slug: workspaceSlug,
          tenantId: tenant.id,
        },
      });

      await tx.workspaceMembership.create({
        data: {
          role: "owner",
          tenantId: tenant.id,
          userId: user.id,
          workspaceId: workspace.id,
        },
      });
      await tx.retentionPolicy.create({
        data: {
          dataClass: "evidence",
          retentionDays: 365,
          tenantId: tenant.id,
          workspaceId: workspace.id,
        },
      });

      await this.auditService.record(
        {
          actorUserId: user.id,
          eventType: "auth.register",
          metadata: {
            email,
          },
          subjectId: user.id,
          subjectType: "user",
          tenantId: tenant.id,
          workspaceId: workspace.id,
        },
        tx,
      );

      await this.auditService.record(
        {
          actorUserId: user.id,
          eventType: "workspace.created",
          subjectId: workspace.id,
          subjectType: "workspace",
          tenantId: tenant.id,
          workspaceId: workspace.id,
        },
        tx,
      );

      return {
        tenant,
        workspace,
        user,
      };
    });

    const tokenPair = this.tokenService.issueAccessToken({
      email: result.user.email,
      tenantId: result.tenant.id,
      userId: result.user.id,
    });

    const workspace = {
      id: result.workspace.id,
      name: result.workspace.name,
      role: "owner",
      slug: result.workspace.slug,
    };
    return {
      ...tokenPair,
      user: {
        email: result.user.email,
        id: result.user.id,
        tenantId: result.tenant.id,
      },
      workspace,
      workspaces: [workspace],
    };
  }

  async login(input: LoginDto): Promise<AuthResponseDto> {
    const email = input.email.trim().toLowerCase();
    const users = await this.prisma.user.findMany({
      include: {
        memberships: {
          include: {
            workspace: true,
          },
          where: {
            workspace: {
              deletedAt: null,
            },
          },
        },
        tenant: true,
      },
      where: {
        deletedAt: null,
        email,
        status: "active",
        tenant: input.tenantSlug
          ? {
              slug: input.tenantSlug,
            }
          : undefined,
      },
    });

    if (users.length !== 1) {
      throw new UnauthorizedException("Invalid email, tenant, or password");
    }

    const user = users[0];
    if (!user || !(await this.passwordService.verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email, tenant, or password");
    }

    await this.prisma.user.update({
      data: {
        lastLoginAt: new Date(),
      },
      where: {
        id: user.id,
      },
    });

    await this.auditService.record({
      actorUserId: user.id,
      eventType: "auth.login",
      metadata: {
        email,
      },
      subjectId: user.id,
      subjectType: "user",
      tenantId: user.tenantId,
    });

    const tokenPair = this.tokenService.issueAccessToken({
      email: user.email,
      tenantId: user.tenantId,
      userId: user.id,
    });

    const workspaces = user.memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
      slug: membership.workspace.slug,
    }));
    return {
      ...tokenPair,
      user: {
        email: user.email,
        id: user.id,
        tenantId: user.tenantId,
      },
      workspace: workspaces[0]!,
      workspaces,
    };
  }

  async me(userId: string, tenantId: string) {
    return this.prisma.user.findFirstOrThrow({
      select: {
        displayName: true,
        email: true,
        id: true,
        lastLoginAt: true,
        memberships: {
          select: {
            role: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            workspaceId: true,
          },
        },
        region: true,
        status: true,
        tenantId: true,
      },
      where: {
        deletedAt: null,
        id: userId,
        tenantId,
      },
    });
  }

  async logout(userId: string, tenantId: string): Promise<{ ok: true }> {
    await this.auditService.record({
      actorUserId: userId,
      eventType: "auth.logout",
      subjectId: userId,
      subjectType: "user",
      tenantId,
    });

    return {
      ok: true,
    };
  }

  private async createUniqueTenantSlug(name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${crypto.randomBytes(3).toString("hex")}`;
      const existing = await this.prisma.tenant.findUnique({
        where: {
          slug,
        },
      });

      if (!existing) {
        return slug;
      }
    }

    throw new ConflictException("Could not create a unique tenant slug");
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
