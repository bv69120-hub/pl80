import { PrismaClient } from "@prisma/client";

export const databaseConfig = {
  provider: "sqlite",
  defaultUrl: "file:./dev.db",
} as const;

export type DatabaseConfig = typeof databaseConfig;

export type UserRole = "ADMIN" | "EMPLOYE";

export const prisma = new PrismaClient();
