import { Injectable, UnauthorizedException } from "@nestjs/common";
import { loadConfig } from "@relationship/config";
import type { AccessTokenClaims, AuthenticatedPrincipal, JwtTokenPair } from "@relationship/auth";
import jwt from "jsonwebtoken";

@Injectable()
export class TokenService {
  private readonly config = loadConfig();

  issueAccessToken(
    principal: Pick<AuthenticatedPrincipal, "email" | "tenantId" | "userId">,
  ): JwtTokenPair {
    const expiresIn = this.config.JWT_ACCESS_TOKEN_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const accessToken = jwt.sign(
      {
        email: principal.email,
        tenantId: principal.tenantId,
      },
      this.config.JWT_ACCESS_SECRET,
      {
        expiresIn,
        subject: principal.userId,
      },
    );

    return {
      accessToken,
      expiresAt,
    };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const decoded = jwt.verify(token, this.config.JWT_ACCESS_SECRET);
      if (typeof decoded !== "object" || !decoded.sub || !decoded.email || !decoded.tenantId) {
        throw new UnauthorizedException("Invalid access token claims");
      }

      return decoded as AccessTokenClaims;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
