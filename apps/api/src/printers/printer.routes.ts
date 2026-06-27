import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
import { printerService } from "@bv/printer";

export const printerRouter: Router = Router();

printerRouter.get("/", authenticate, (_request, response) => {
  response.json(printerService.listPrinters());
});

printerRouter.get("/default", authenticate, (_request, response) => {
  const printer = printerService.getDefaultPrinter();

  if (!printer) {
    response.status(404).json({ message: "No default printer found" });
    return;
  }

  response.json(printer);
});

printerRouter.get("/:name/validate", authenticate, (request, response) => {
  const printerName = Array.isArray(request.params.name)
    ? request.params.name[0]
    : request.params.name;
  const printer = printerService.validatePrinter(printerName);

  if (!printer) {
    response.status(404).json({ message: "Printer not found" });
    return;
  }

  response.json(printer);
});
