import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { describe, expect, test } from "vitest";

import { toApiErrorBody } from "./http-exception.filter";

describe("toApiErrorBody", () => {
  test("normalizes Nest validation errors while preserving the request id", () => {
    expect(
      toApiErrorBody(new BadRequestException({ message: ["email must be an email"] }), {
        nodeEnv: "development",
        path: "/v1/auth/register",
        requestId: "req_validation",
      }),
    ).toMatchObject({
      code: "BAD_REQUEST",
      details: { message: ["email must be an email"] },
      message: "email must be an email",
      path: "/v1/auth/register",
      requestId: "req_validation",
      statusCode: 400,
    });
  });

  test("hides internal error details in production", () => {
    expect(
      toApiErrorBody(new InternalServerErrorException("secret stack detail"), {
        nodeEnv: "production",
        path: "/v1/briefs",
        requestId: "req_hidden",
      }),
    ).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      path: "/v1/briefs",
      requestId: "req_hidden",
      statusCode: 500,
    });
  });
});
