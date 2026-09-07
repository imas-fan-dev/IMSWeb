import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectRouteInventory } from "../compile-route-inventory.mjs";

function fixture(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imsweb-route-inventory-"));
  fs.writeFileSync(path.join(root, "app.ts"), source);
  return root;
}

function write(root, name, source) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

test("expands factories, mounts, aliases, loops, method arrays, raw reads, and response candidates", () => {
  const root = fixture(`
    function createRouter() { return {} as any }
    function jsonSchemaValidator(schema: unknown) { return schema }
    function querySchemaValidator(schema: unknown) { return schema }
    function paramSchemaValidator(schema: unknown) { return schema }
    function strictRequestObject(value: unknown) { return value }
    function legacyStripRequestObject(value: unknown) { return value }
    function legacyPassthroughRequestObject(value: unknown) { return value }
    const aliasedProjectSchema = legacyStripRequestObject({});
    const transformedProjectSchema = (aliasedProjectSchema as any).transform((value: unknown) => value);
    const METHODS = ["GET", "HEAD"] as const;
    const aliases = ["/one", "/compat"] as const;
    function routes() {
      const router = createRouter();
      for (const route of aliases) {
        router.on(METHODS, route, querySchemaValidator(legacyStripRequestObject({})), (c: any) => c.json({ route }));
      }
      router.put("/hybrid/:id", paramSchemaValidator(strictRequestObject({})), jsonSchemaValidator(legacyPassthroughRequestObject({})), async (c: any) => {
        await c.req.json(); c.req.query("mode"); return c.json({ ok: true });
      });
      router.post("/form", async (c: any) => { await c.req.raw.formData(); JSON.parse("{}"); return c.text("ok"); });
      router.post("/transformed", jsonSchemaValidator(transformedProjectSchema), (c: any) => c.json({ ok: true }));
      router.get("/raw/:id", (c: any) => c.req.param("id"));
      return router;
    }
    export function createApp() { const app = createRouter(); app.route("/api", routes()); return app; }
  `);
  const inventory = collectRouteInventory(root, { entry: "app.ts", entrySymbol: "createApp" });
  assert.equal(inventory.diagnostics.length, 0);
  assert.deepEqual(inventory.routes.map((route) => `${route.method} ${route.path}`).sort(), [
    "GET /api/compat", "GET /api/one", "GET /api/raw/:id", "HEAD /api/compat", "HEAD /api/one", "POST /api/form", "POST /api/transformed", "PUT /api/hybrid/:id",
  ]);
  const hybrid = inventory.routes.find((route) => route.path === "/api/hybrid/:id");
  assert.deepEqual(hybrid.carriers.map((carrier) => [carrier.kind, carrier.policy]).sort(), [
    ["json", "passthrough"], ["param", "accept-and-project"], ["query", "accept-and-project"],
  ]);
  assert.equal(hybrid.carriers.find((carrier) => carrier.kind === "param").syntaxPolicy, "reject");
  const form = inventory.routes.find((route) => route.path === "/api/form");
  assert.deepEqual(form.carriers.map((carrier) => carrier.kind).sort(), ["form-data"]);
  const raw = inventory.routes.find((route) => route.path === "/api/raw/:id");
  assert.deepEqual(raw.carriers.map((carrier) => [carrier.kind, carrier.policy]), [["param", "non-object-applicable"]]);
  const transformed = inventory.routes.find((route) => route.path === "/api/transformed");
  assert.deepEqual(transformed.carriers.map((carrier) => [carrier.kind, carrier.policy]), [["json", "accept-and-project"]]);
  assert.ok(inventory.responses.some((response) => response.path === "/api/hybrid/:id" && response.kind === "json"));
  assert.ok(inventory.responses.some((response) => response.path === "/api/one" && response.kind === "json"));
});

test("follows imported request helpers and recognizes route-local validator wrappers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imsweb-route-inventory-"));
  write(root, "helpers.ts", `
    export async function readRequest(c: any) { await c.req.json(); return { ok: true }; }
  `);
  write(root, "app.ts", `
    import { readRequest } from "./helpers";
    function createRouter() { return {} as any }
    function strictRequestObject(value: unknown) { return value }
    function mapDeliveryJsonSchemaValidator(schema: unknown) { return schema }
    export function createApp() {
      const app = createRouter();
      app.post("/helper", async (c: any) => { await readRequest(c); return c.json({ ok: true }); });
      app.put("/custom", mapDeliveryJsonSchemaValidator(strictRequestObject({})), (c: any) => c.json({ ok: true }));
      app.get("/raw/:id", (context: any) => { new URL(context.req.raw.url); return c.json({ ok: true }); });
      return app;
    }
  `);
  const inventory = collectRouteInventory(root, { entry: "app.ts", entrySymbol: "createApp" });
  assert.equal(inventory.diagnostics.length, 0);
  assert.deepEqual(
    inventory.carriers.map((carrier) => [carrier.method, carrier.path, carrier.kind, carrier.policy]).sort(),
    [
      ["GET", "/raw/:id", "param", "non-object-applicable"],
      ["POST", "/helper", "json", "accept-and-project"],
      ["PUT", "/custom", "json", "reject"],
    ],
  );
});

test("reports a production baseline mismatch instead of accepting an incomplete inventory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imsweb-route-inventory-"));
  write(root, "apps/api/src/app.ts", `
    function createRouter() { return {} as any }
    export function createHonoApp() { const app = createRouter(); app.get("/only", (c: any) => c.req.query("q")); return app; }
  `);
  const inventory = collectRouteInventory(root);
  assert.match(
    inventory.diagnostics.map((issue) => issue.message).join("\n"),
    /baseline-compatible .* expected .* found/,
  );
});

test("reports unresolved dynamic routes as fatal diagnostics instead of dropping them", () => {
  const root = fixture(`
    function createRouter() { return {} as any }
    declare function runtimePath(): string;
    export function createApp() { const app = createRouter(); app.get(runtimePath(), () => new Response("ok")); return app; }
  `);
  const inventory = collectRouteInventory(root, { entry: "app.ts", entrySymbol: "createApp" });
  assert.equal(inventory.routes.length, 0);
  assert.equal(inventory.diagnostics.length, 1);
  assert.equal(inventory.diagnostics[0].message, "unresolved dynamic route path");
  assert.equal(inventory.diagnostics[0].file, "app.ts");
});
