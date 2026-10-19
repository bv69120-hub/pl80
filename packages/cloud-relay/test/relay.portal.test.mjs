import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { test } from "node:test";
import { WebSocket } from "ws";
import { createRelayServer } from "../dist/relay.js";

const storeId = "demo-store";
const storeSecret = "store-secret-not-for-browser";
const sessionSecret = "session-secret-for-tests";

async function withRelay(callback) {
  const relay = createRelayServer({
    stores: { [storeId]: storeSecret, "offline-store": "offline-secret" },
    sessionSecret,
    allowInsecureLocal: true,
  });
  const server = createServer(relay.app);
  relay.attach(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let socket;

  try {
    await callback({
      baseUrl,
      connectStore: async () => {
        socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?storeId=${storeId}`, {
          headers: { Authorization: `Bearer ${storeSecret}` },
        });
        await new Promise((resolve, reject) => {
          socket.once("open", resolve);
          socket.once("error", reject);
        });
        return socket;
      },
    });
  } finally {
    socket?.close();
    relay.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function getPortal(baseUrl, path = `/${storeId}`) {
  return globalThis.fetch(`${baseUrl}${path}`);
}

function tokenFromPage(html) {
  const match = html.match(/window\.bvCloudPortal=(\{[^<]+?\});<\/script>/);
  assert.ok(match, "the store page bootstraps the React portal");
  return JSON.parse(match[1]).uploadToken;
}

function pdfForm(token, bytes = "%PDF-1.7\nsynthetic-test-document", filename = "label.pdf") {
  const form = new globalThis.FormData();
  form.append("token", token);
  form.append("file", new globalThis.Blob([bytes], { type: "application/pdf" }), filename);
  return form;
}

test("the current store QR URL serves the React portal and static frontend assets", async () => {
  await withRelay(async ({ baseUrl, connectStore }) => {
    await connectStore();
    const response = await getPortal(baseUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const html = await response.text();
    assert.match(html, /id="root"/);
    assert.match(html, /window\.bvCloudPortal=/);
    assert.doesNotMatch(html, new RegExp(storeSecret));

    const assetPath = html.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(assetPath, "the built portal javascript is referenced");
    const asset = await globalThis.fetch(`${baseUrl}${assetPath}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type") ?? "", /javascript/);

    const health = await globalThis.fetch(`${baseUrl}/health`);
    assert.deepEqual(await health.json(), { name: "BV Cloud Relay", status: "ok" });
  });
});

test("Cloud uploads retain single-use tokens and relay jobs without reporting a physical print", async () => {
  await withRelay(async ({ baseUrl, connectStore }) => {
    const socket = await connectStore();
    const page = await getPortal(baseUrl);
    const token = tokenFromPage(await page.text());
    const queuedJob = new Promise((resolve, reject) => {
      socket.once("message", (message) => resolve(JSON.parse(message.toString())));
      socket.once("error", reject);
    });

    const upload = await globalThis.fetch(`${baseUrl}/api/jobs/${storeId}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: pdfForm(token),
    });
    assert.equal(upload.status, 202);
    assert.deepEqual(await upload.json(), { id: (await queuedJob).id, status: "PENDING" });

    const duplicate = await globalThis.fetch(`${baseUrl}/api/jobs/${storeId}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: pdfForm(token),
    });
    assert.equal(duplicate.status, 401);
    assert.match((await duplicate.json()).message, /session a expiré/i);
  });
});

test("the existing browser form keeps its HTML response and offline checks", async () => {
  await withRelay(async ({ baseUrl, connectStore }) => {
    await connectStore();
    const page = await getPortal(baseUrl);
    const token = tokenFromPage(await page.text());
    const response = await globalThis.fetch(`${baseUrl}/api/jobs/${storeId}`, {
      method: "POST",
      body: pdfForm(token),
    });
    assert.equal(response.status, 202);
    assert.match(await response.text(), /PDF envoyé/);
    assert.match((await getPortal(baseUrl, "/offline-store")).status.toString(), /^503$/);
    assert.equal((await getPortal(baseUrl, "/unknown-store")).status, 404);
  });
});

test("Cloud uploads reject invalid PDF signatures and return readable JSON errors", async () => {
  await withRelay(async ({ baseUrl, connectStore }) => {
    await connectStore();
    const page = await getPortal(baseUrl);
    const token = tokenFromPage(await page.text());
    const response = await globalThis.fetch(`${baseUrl}/api/jobs/${storeId}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: pdfForm(token, "not-a-pdf", "invalid.pdf"),
    });
    assert.equal(response.status, 415);
    assert.match((await response.json()).message, /pas un PDF valide/i);
  });
});

test("oversized Cloud uploads preserve the 10 MB limit and JSON error response", async () => {
  await withRelay(async ({ baseUrl, connectStore }) => {
    await connectStore();
    const page = await getPortal(baseUrl);
    const token = tokenFromPage(await page.text());
    const response = await globalThis.fetch(`${baseUrl}/api/jobs/${storeId}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: pdfForm(token, Buffer.alloc(10 * 1024 * 1024 + 1, 65)),
    });
    assert.equal(response.status, 413);
    assert.match((await response.json()).message, /10 Mo/);
  });
});
