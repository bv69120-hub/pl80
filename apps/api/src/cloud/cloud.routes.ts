import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
import { getCloudStatus, setConnectionMode } from "./cloud.connection.service.js";

export const cloudRouter: Router = Router();
cloudRouter.use(authenticate);
cloudRouter.get("/status", async (_request, response, next) => {
  try {
    response.json(await getCloudStatus());
  } catch (error) {
    next(error);
  }
});
cloudRouter.post("/mode", async (request, response, next) => {
  try {
    const mode = request.body?.mode;
    if (mode !== "LOCAL" && mode !== "CLOUD") {
      response.status(400).json({ message: "Mode invalide" });
      return;
    }
    response.json(await setConnectionMode(mode));
  } catch (error) {
    next(error);
  }
});
