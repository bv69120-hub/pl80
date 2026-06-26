import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "@bv/database";
import type { AuthenticatedUser, AuthTokenPayload } from "./auth.types.js";

const defaultJwtSecret = "bv-expedition-pro-development-secret";

function getJwtSecret() {
  return process.env.JWT_SECRET ?? defaultJwtSecret;
}

function getJwtExpiresIn(): SignOptions["expiresIn"] {
  return (process.env.JWT_EXPIRES_IN ?? "8h") as SignOptions["expiresIn"];
}

function toUserRole(role: string) {
  if (role !== "ADMIN" && role !== "EMPLOYE") {
    throw new Error(`Unsupported user role: ${role}`);
  }

  return role;
}

export async function loginWithPassword(username: string, password: string) {
  const user = await prisma.user.findUnique({
    where: {
      username,
    },
  });

  if (!user) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  const authenticatedUser: AuthenticatedUser = {
    id: user.id,
    username: user.username,
    role: toUserRole(user.role),
  };

  const payload: AuthTokenPayload = {
    ...authenticatedUser,
    sub: user.id,
  };

  const token = jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
  });

  return {
    token,
    user: authenticatedUser,
  };
}

export async function findAuthenticatedUserById(id: string): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      username: true,
      role: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    ...user,
    role: toUserRole(user.role),
  };
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret());

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.id !== "string" ||
      typeof payload.username !== "string" ||
      (payload.role !== "ADMIN" && payload.role !== "EMPLOYE")
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
