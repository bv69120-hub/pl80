import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import process from "node:process";

const fetch = globalThis.fetch;
const originalToken = process.env.BV_BOOTSTRAP_TOKEN;
const bootstrapToken = "test-bootstrap-token-which-is-long-enough";
process.env.BV_BOOTSTRAP_TOKEN = bootstrapToken;

const { prisma } = await import("@bv/database");
const { createApp } = await import("../dist/app.js");
const originalUserCount = prisma.user.count;
const originalTransaction = prisma.$transaction;
let users = [];
prisma.user.count = async () => users.length;
prisma.$transaction = async (operation) =>
  operation({
    user: {
      count: async () => users.length,
      create: async ({ data }) => {
        const user = { id: "bootstrap-admin", ...data };
        users.push(user);
        return user;
      },
    },
  });

const server = createApp().listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

after(async () => {
  prisma.user.count = originalUserCount;
  prisma.$transaction = originalTransaction;
  if (originalToken === undefined) delete process.env.BV_BOOTSTRAP_TOKEN;
  else process.env.BV_BOOTSTRAP_TOKEN = originalToken;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("initial setup only permits one token-authorized administrator creation", async () => {
  const statusResponse = await fetch(`${baseUrl}/api/auth/setup-status`);
  assert.deepEqual(await statusResponse.json(), { setupRequired: true });

  const deniedResponse = await fetch(`${baseUrl}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BV-Bootstrap-Token": "wrong-token" },
    body: JSON.stringify({ username: "first-admin", password: "long-enough-password" }),
  });
  assert.equal(deniedResponse.status, 403);
  assert.equal(users.length, 0);

  const invalidResponse = await fetch(`${baseUrl}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BV-Bootstrap-Token": bootstrapToken },
    body: JSON.stringify({ username: "first-admin", password: "short" }),
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal(users.length, 0);

  const createdResponse = await fetch(`${baseUrl}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BV-Bootstrap-Token": bootstrapToken },
    body: JSON.stringify({ username: "first-admin", password: "long-enough-password" }),
  });
  assert.equal(createdResponse.status, 201);
  assert.equal(users.length, 1);
  assert.equal(users[0].role, "ADMIN");
  assert.notEqual(users[0].passwordHash, "long-enough-password");

  const reuseResponse = await fetch(`${baseUrl}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BV-Bootstrap-Token": bootstrapToken },
    body: JSON.stringify({ username: "second-admin", password: "long-enough-password" }),
  });
  assert.equal(reuseResponse.status, 403);
  assert.equal(users.length, 1);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/auth/setup-status`)).json(), {
    setupRequired: false,
  });
});
