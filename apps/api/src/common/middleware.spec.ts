import { describe, expect, test } from "vitest";

import { RATE_LIMIT_RESET_HEADER, createRateLimitMiddleware } from "./rate-limit.middleware";
import { REQUEST_ID_HEADER, requestIdMiddleware } from "./request-id.middleware";

function createResponse() {
  const headers = new Map<string, string>();
  const response = {
    body: undefined as unknown,
    statusCode: 200,
    headers,
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
  };

  return response;
}

describe("requestIdMiddleware", () => {
  test("creates and returns a request id when callers do not provide one", () => {
    const request = { headers: {} } as never;
    const response = createResponse();
    let nextCalled = false;

    requestIdMiddleware(request, response as never, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(request).toHaveProperty("requestId");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(
      (request as { requestId: string }).requestId,
    );
  });

  test("keeps a trusted incoming request id", () => {
    const request = { headers: { [REQUEST_ID_HEADER]: "req_existing" } } as never;
    const response = createResponse();

    requestIdMiddleware(request, response as never, () => undefined);

    expect((request as { requestId: string }).requestId).toBe("req_existing");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req_existing");
  });
});

describe("createRateLimitMiddleware", () => {
  test("allows requests under the configured limit", () => {
    const middleware = createRateLimitMiddleware({ max: 2, now: () => 10_000, windowMs: 60_000 });
    const request = {
      ip: "127.0.0.1",
      method: "POST",
      originalUrl: "/v1/search",
      path: "/v1/search",
      requestId: "req_ok",
    } as never;
    const response = createResponse();
    let nextCount = 0;

    middleware(request, response as never, () => {
      nextCount += 1;
    });
    middleware(request, response as never, () => {
      nextCount += 1;
    });

    expect(nextCount).toBe(2);
    expect(response.statusCode).toBe(200);
  });

  test("returns a structured 429 with request id when the bucket is exhausted", () => {
    const middleware = createRateLimitMiddleware({ max: 1, now: () => 10_000, windowMs: 60_000 });
    const request = {
      ip: "127.0.0.1",
      method: "POST",
      originalUrl: "/v1/search",
      path: "/v1/search",
      requestId: "req_limited",
    } as never;
    const response = createResponse();

    middleware(request, response as never, () => undefined);
    middleware(request, response as never, () => undefined);

    expect(response.statusCode).toBe(429);
    expect(response.headers.get(RATE_LIMIT_RESET_HEADER)).toBe("70");
    expect(response.body).toEqual({
      code: "RATE_LIMITED",
      message: "Too many requests. Try again after the rate limit resets.",
      requestId: "req_limited",
    });
  });
});
