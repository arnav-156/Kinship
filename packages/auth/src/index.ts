import type { WorkspaceRole } from "@relationship/shared";

export interface AuthenticatedPrincipal {
  email: string;
  tenantId: string;
  userId: string;
  workspaceRoles: Array<{
    role: WorkspaceRole;
    workspaceId: string;
  }>;
}

export interface JwtTokenPair {
  accessToken: string;
  expiresAt: string;
  refreshToken?: string;
}

export interface AccessTokenClaims {
  email: string;
  exp: number;
  iat: number;
  sub: string;
  tenantId: string;
}
