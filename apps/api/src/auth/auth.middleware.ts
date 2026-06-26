import type { RequestHandler } from "express";
import type { UserRole } from "@bv/database";
import { findAuthenticatedUserById, verifyAuthToken } from "./auth.service.js";
import type { AuthenticatedUser } from "./auth.types.js";

export interface AuthenticatedRequest {
  auth?: AuthenticatedUser;
}

function extractBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

export const authenticate: RequestHandler = async (request, response, next) => {
  const token = extractBearerToken(request.header("authorization"));

  if (!token) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }

  const payload = verifyAuthToken(token);

  if (!payload) {
    response.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  const user = await findAuthenticatedUserById(payload.sub);

  if (!user) {
    response.status(401).json({ message: "Authenticated user not found" });
    return;
  }

  (request as AuthenticatedRequest).auth = user;
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request, response, next) => {
    const authenticatedRequest = request as AuthenticatedRequest;

    if (!authenticatedRequest.auth) {
      response.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!roles.includes(authenticatedRequest.auth.role)) {
      response.status(403).json({ message: "Insufficient permissions" });
      return;
    }

    next();
  };
}
