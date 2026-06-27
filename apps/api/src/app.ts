import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { appConfig } from "@bv/shared";
import { authRouter } from "./auth/auth.routes.js";
import { printJobsRouter } from "./print-jobs/print.jobs.routes.js";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use("/api/auth", authRouter);
  app.use("/api/print-jobs", printJobsRouter);

  app.get("/health", (_request, response) => {
    response.json({
      name: appConfig.name,
      status: "ok",
    });
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      void next;
      console.error(error);
      response.status(500).json({ message: "Internal server error" });
    },
  );

  return app;
}
