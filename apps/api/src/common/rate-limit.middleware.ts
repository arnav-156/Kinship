import type { NextFunction, Response } from "express";

import type { RequestContext } from "./request-context";

export const RATE_LIMIT_RESET_HEADER = "x-ratelimit-reset";

const defaultSkippedPaths = new Set(["/health", "/ready", "/metrics"]);

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  buckets?: Map<string, RateLimitBucket>;
  max: number;
  now?: () => number;
  skipPaths?: Set<string>;
  windowMs: number;
};

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const buckets = options.buckets ?? new Map<string, RateLimitBucket>();
  const now = options.now ?? Date.now;
  const skipPaths = options.skipPaths ?? defaultSkippedPaths;

  return (req: RequestContext, res: Response, next: NextFunction): void => {
    const path = getRequestPath(req);
    if (options.max <= 0 || options.windowMs <= 0 || skipPaths.has(path)) {
      next();
      return;
    }

    const timestamp = now();
    const key = `${getClientIp(req)}:${req.method}:${path}`;
    const existing = buckets.get(key);
    const bucket =
      !existing || existing.resetAt <= timestamp
        ? createBucket(timestamp, options.windowMs)
        : existing;

    if (bucket.count >= options.max) {
      res.setHeader(RATE_LIMIT_RESET_HEADER, String(Math.ceil(bucket.resetAt / 1000)));
      res.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many requests. Try again after the rate limit resets.",
        requestId: req.requestId,
      });
      return;
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    next();
  };
}

function createBucket(timestamp: number, windowMs: number): RateLimitBucket {
  return {
    count: 0,
    resetAt: timestamp + windowMs,
  };
}

function getClientIp(req: RequestContext): string {
  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0];
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

function getRequestPath(req: RequestContext): string {
  const value = req.path || req.originalUrl || req.url || "/";
  return value.split("?")[0] || "/";
}
