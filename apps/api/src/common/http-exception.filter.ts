import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

import type { RequestContext } from "./request-context";

type NodeEnv = "development" | "test" | "production";

type ErrorContext = {
  nodeEnv: NodeEnv;
  now?: () => Date;
  path: string;
  requestId?: string;
};

export type ApiErrorBody = {
  code: string;
  details?: unknown;
  message: string;
  path: string;
  requestId?: string;
  statusCode: number;
  timestamp: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly nodeEnv: NodeEnv = "development") {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestContext>();
    const response = context.getResponse<Response>();
    const body = toApiErrorBody(exception, {
      nodeEnv: this.nodeEnv,
      path: request.originalUrl || request.url,
      requestId: request.requestId,
    });

    response.status(body.statusCode).json(body);
  }
}

export function toApiErrorBody(exception: unknown, context: ErrorContext): ApiErrorBody {
  const statusCode =
    exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
  const response = exception instanceof HttpException ? exception.getResponse() : undefined;
  const responseObject = asRecord(response);
  const rawMessage =
    responseObject?.message ?? (typeof response === "string" ? response : undefined);
  const message =
    context.nodeEnv === "production" && statusCode >= 500
      ? "Internal server error"
      : normalizeMessage(rawMessage, exception);
  const body: ApiErrorBody = {
    code: statusCodeToCode(statusCode),
    message,
    path: context.path,
    requestId: context.requestId,
    statusCode,
    timestamp: (context.now?.() ?? new Date()).toISOString(),
  };

  if (context.nodeEnv !== "production" && responseObject) {
    body.details = responseObject;
  }

  return body;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeMessage(rawMessage: unknown, exception: unknown): string {
  if (Array.isArray(rawMessage)) {
    return rawMessage.map(String).join("; ");
  }

  if (typeof rawMessage === "string" && rawMessage.length > 0) {
    return rawMessage;
  }

  if (exception instanceof Error && exception.message.length > 0) {
    return exception.message;
  }

  return "Unexpected error";
}

function statusCodeToCode(statusCode: number): string {
  const statusNames = HttpStatus as unknown as Record<number, string>;
  return statusNames[statusCode] ?? "HTTP_ERROR";
}
