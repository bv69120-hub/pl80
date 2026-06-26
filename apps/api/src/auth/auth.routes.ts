import { Router } from "express";
import type { AuthenticatedRequest } from "./auth.middleware.js";
import { authenticate } from "./auth.middleware.js";
import { loginWithPassword } from "./auth.service.js";

export const authRouter: Router = Router();

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
