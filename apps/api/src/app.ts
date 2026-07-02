import cors from "cors";
import path from "node:path";
import express, { type Express } from "express";
import helmet from "helmet";
import { appConfig } from "@bv/shared";
import { authRouter } from "./auth/auth.routes.js";
import { printJobsRouter } from "./print-jobs/print.jobs.routes.js";
import { clientPrintRouter } from "./print-jobs/client.print.routes.js";
import { clientModeSettingsRouter } from "./settings/client.mode.routes.js";
import { cloudRouter } from "./cloud/cloud.routes.js";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use("/api/auth", authRouter);
  app.use("/api/print-jobs", printJobsRouter);
  app.use("/api/client-print", clientPrintRouter);
  app.use("/api/settings/client-mode", clientModeSettingsRouter);
  app.use("/api/cloud", cloudRouter);

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
      if (error instanceof Error && error.message === "PDF_ONLY") {
        response.status(400).json({ message: "Seuls les fichiers PDF sont acceptés." });
        return;
      }
      if (error instanceof Error && error.name === "MulterError") {
        response.status(400).json({ message: "Le PDF dépasse la taille maximale de 10 Mo." });
        return;
      }
      response.status(500).json({ message: "Internal server error" });
    },
  );

  return app;
}

export function createFrontendApp(webRoot: string): Express {
  const frontend = express();
  frontend.use(express.static(webRoot));
  frontend.get("*", (_request, response) => {
    response.sendFile(path.join(webRoot, "index.html"));
  });
  return frontend;
}
