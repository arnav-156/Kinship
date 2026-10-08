import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";

import type { RequestContext } from "./request-context";

export const REQUEST_ID_HEADER = "x-request-id";

const trustedRequestIdPattern = /^[a-zA-Z0-9._:-]{1,128}$/;

export function requestIdMiddleware(req: RequestContext, res: Response, next: NextFunction): void {
  const incomingRequestId = req.headers[REQUEST_ID_HEADER];
  const requestId = getTrustedRequestId(incomingRequestId) ?? randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

function getTrustedRequestId(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return trustedRequestIdPattern.test(value) ? value : undefined;
}
