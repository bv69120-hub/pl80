import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "@bv/database";
import type { AuthenticatedRequest } from "./auth.middleware.js";
import { authenticate } from "./auth.middleware.js";
import { loginWithPassword } from "./auth.service.js";

export const authRouter: Router = Router();
let bootstrapToken = process.env.BV_BOOTSTRAP_TOKEN;
let bootstrapInProgress = false;

authRouter.get("/setup-status", async (_request, response, next) => {
  try {
    response.json({ setupRequired: (await prisma.user.count()) === 0 });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/bootstrap", async (request, response, next) => {
  const presentedToken = request.header("x-bv-bootstrap-token") ?? "";
  const expected = bootstrapToken ?? "";
  const presentedBytes = Buffer.from(presentedToken);
  const expectedBytes = Buffer.from(expected);
  const tokenMatches =
    expectedBytes.length > 0 &&
    presentedBytes.length === expectedBytes.length &&
    timingSafeEqual(presentedBytes, expectedBytes);
  if (!tokenMatches || bootstrapInProgress) {
    response.status(403).json({ message: "Initialisation indisponible." });
    return;
  }

  const { username, password } = request.body as {
    username?: unknown;
    password?: unknown;
  };
  if (
    typeof username !== "string" ||
    !/^[A-Za-z0-9._-]{3,40}$/.test(username) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  ) {
    response.status(400).json({
      message:
        "Choisissez un nom de 3 à 40 caractères et un mot de passe de 12 caractères minimum.",
    });
    return;
  }

  bootstrapInProgress = true;
  try {
    const user = await prisma.$transaction(async (transaction) => {
      if ((await transaction.user.count()) !== 0) return null;
      return transaction.user.create({
        data: {
          username,
          passwordHash: await bcrypt.hash(password, 12),
          role: "ADMIN",
        },
      });
    });
    if (!user) {
      bootstrapToken = undefined;
      response.status(409).json({ message: "Un compte existe déjà. Connectez-vous." });
      return;
    }
    bootstrapToken = undefined;
    response.status(201).json({ created: true });
  } catch (error) {
    next(error);
  } finally {
    bootstrapInProgress = false;
  }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const { username, password } = request.body as {
      username?: unknown;
      password?: unknown;
    };

    if (typeof username !== "string" || typeof password !== "string") {
      response.status(400).json({ message: "Username and password are required" });
      return;
    }

    const result = await loginWithPassword(username, password);

    if (!result) {
      response.status(401).json({ message: "Invalid credentials" });
      return;
    }

    response.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticate, (request, response) => {
  const authenticatedRequest = request as AuthenticatedRequest;

  response.json({
    user: authenticatedRequest.auth,
  });
});
