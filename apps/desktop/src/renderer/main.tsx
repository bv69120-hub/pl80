import React from "react";
import ReactDOM from "react-dom/client";
import { AppShell } from "@bv/ui";
import { appConfig } from "@bv/shared";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppShell appName={`${appConfig.name} Desktop`} />
  </React.StrictMode>,
);
