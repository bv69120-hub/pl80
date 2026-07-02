import { createServer } from "node:http";
import { createRelayServer } from "./relay.js";

const storeId = process.env.STORE_ID ?? "demo-store";
const storeSecret = process.env.STORE_SECRET ?? "demo-secret-change-me";
const relay = createRelayServer({
  stores: { [storeId]: storeSecret },
  sessionSecret: process.env.RELAY_SESSION_SECRET ?? "local-session-secret-change-me",
  allowInsecureLocal:
    process.env.RELAY_ALLOW_INSECURE === "true" || process.env.NODE_ENV !== "production",
});
const server = createServer(relay.app);
relay.attach(server);
const port = Number(process.env.RELAY_PORT ?? 4444);
server.listen(port, process.env.RELAY_HOST ?? "127.0.0.1", () =>
  console.log(`[cloud-relay] http://127.0.0.1:${port}/${storeId}`),
);
