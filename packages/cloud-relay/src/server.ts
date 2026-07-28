import { createServer } from "node:http";
import { createRelayServer } from "./relay.js";

const production = process.env.NODE_ENV === "production";
const storeId = process.env.STORE_ID ?? (production ? "" : "demo-store");
const storeSecret = process.env.STORE_SECRET ?? (production ? "" : "demo-secret-change-me");
const sessionSecret =
  process.env.RELAY_SESSION_SECRET ?? (production ? "" : "local-session-secret-change-me");
if (!storeId || !storeSecret || !sessionSecret) {
  throw new Error("STORE_ID, STORE_SECRET and RELAY_SESSION_SECRET are required in production.");
}
const relay = createRelayServer({
  stores: { [storeId]: storeSecret },
  sessionSecret,
  allowInsecureLocal:
    !production &&
    (process.env.CLOUD_RELAY_ALLOW_INSECURE === "true" ||
      process.env.RELAY_ALLOW_INSECURE === "true"),
});
const server = createServer(relay.app);
relay.attach(server);
const port = Number(process.env.PORT ?? process.env.RELAY_PORT ?? 4444);
const host = process.env.RELAY_HOST ?? "0.0.0.0";
server.listen(port, host, () => console.log(`[cloud-relay] listening on ${host}:${port}`));
