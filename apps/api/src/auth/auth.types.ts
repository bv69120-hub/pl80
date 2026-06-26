import type { UserRole } from "@bv/database";

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface AuthTokenPayload extends AuthenticatedUser {
  sub: string;
}
