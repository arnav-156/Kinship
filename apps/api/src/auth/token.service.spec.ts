import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { TokenService } from "./token.service";

const validEnv = {
  DATABASE_URL: "postgresql://relationship:relationship@localhost:5432/relationship",
  JWT_ACCESS_SECRET: "a-development-secret-at-least-24-chars",
  REDIS_URL: "redis://localhost:6379",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_BUCKET: "relationship-local",
  S3_ENDPOINT: "http://localhost:9000",
  S3_SECRET_ACCESS_KEY: "minioadmin",
};

describe("TokenService", () => {
  it("issues and verifies tenant-scoped access tokens", () => {
    Object.assign(process.env, validEnv);
    const service = new TokenService();

    const token = service.issueAccessToken({
      email: "owner@example.local",
      tenantId: "tenant_1",
      userId: "user_1",
    });

    const claims = service.verifyAccessToken(token.accessToken);

    expect(claims).toMatchObject({
      email: "owner@example.local",
      sub: "user_1",
      tenantId: "tenant_1",
    });
  });

  it("rejects invalid tokens", () => {
    Object.assign(process.env, validEnv);
    const service = new TokenService();

    expect(() => service.verifyAccessToken("not-a-token")).toThrow(UnauthorizedException);
  });
});
