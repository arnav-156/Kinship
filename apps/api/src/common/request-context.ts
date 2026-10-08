import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { Request } from "express";

export interface RequestContext extends Request {
  principal?: AuthenticatedPrincipal;
  requestId?: string;
}

export interface AuthenticatedRequest extends RequestContext {
  principal: AuthenticatedPrincipal;
}
