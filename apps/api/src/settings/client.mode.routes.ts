import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
import {
  getClientMode,
  regenerateClientToken,
  setClientModeEnabled,
} from "./client.mode.service.js";

export const clientModeSettingsRouter: Router = Router();
clientModeSettingsRouter.use(authenticate);

clientModeSettingsRouter.get("/", async (_request, response, next) => {
  try {
    response.json(await getClientMode());
  } catch (error) {
    next(error);
  }
});
clientModeSettingsRouter.post("/enable", async (_request, response, next) => {
  try {
    response.json(await setClientModeEnabled(true));
  } catch (error) {
    next(error);
  }
});
clientModeSettingsRouter.post("/disable", async (_request, response, next) => {
  try {
    response.json(await setClientModeEnabled(false));
  } catch (error) {
    next(error);
  }
});
clientModeSettingsRouter.post("/regenerate-token", async (_request, response, next) => {
  try {
    response.json(await regenerateClientToken());
  } catch (error) {
    next(error);
  }
});
