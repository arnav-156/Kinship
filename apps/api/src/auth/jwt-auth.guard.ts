import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@relationship/db";
import type { WorkspaceRole } from "@relationship/shared";

import type { AuthenticatedRequest } from "../common/request-context";
import { PRISMA_CLIENT } from "../database/prisma.token";
import { TokenService } from "./token.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    const claims = this.tokenService.verifyAccessToken(token);
    const user = await this.prisma.user.findFirst({
      include: {
        memberships: true,
      },
      where: {
        deletedAt: null,
        id: claims.sub,
        status: "active",
        tenantId: claims.tenantId,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Authenticated user was not found");
    }

    request.principal = {
      email: user.email,
      tenantId: user.tenantId,
      userId: user.id,
      workspaceRoles: user.memberships.map((membership) => ({
        role: membership.role as WorkspaceRole,
        workspaceId: membership.workspaceId,
      })),
    };

    return true;
  }

  private extractBearerToken(authorization?: string): string {
    const [scheme, token] = authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Bearer token is required");
    }

    return token;
  }
}
