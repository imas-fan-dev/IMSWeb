import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectRouteInventory,
  routeInventoryArtifact,
  runInventoryCli,
} from "../compile-route-inventory.mjs";

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

function runFixtureCli(root, arguments_) {
  let stdout = "";
  const artifact = runInventoryCli(arguments_, {
    root,
    output: { json: path.join(root, "current-wire-contract-inventory.json") },
    collectOptions: { entry: "app.ts", entrySymbol: "createApp" },
    writeStdout(value) { stdout += value; },
  });
  return { artifact, stdout };
}

function semanticFixture(overrides = {}) {
  return `
    function createRouter() { return {} as any }
    function jsonSchemaValidator(schema: unknown) { return schema }
    function strictRequestObject(value: unknown) { return value }
    function legacyStripRequestObject(value: unknown) { return value }
    ${overrides.declarations ?? ""}
    export function createApp() {
      const app = createRouter();
      app.post(${overrides.path ?? '"/items"'}, jsonSchemaValidator(${overrides.schema ?? "legacyStripRequestObject({})"}), async (c: any) => {
        ${overrides.requestRead ?? "await c.req.json();"}
        return ${overrides.response ?? 'c.json({ ok: true })'};
      });
      return app;
    }
  `;
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

test("production inventory preserves approved totals and route-level reconciliation", () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const collected = collectRouteInventory(repositoryRoot);
  const current = routeInventoryArtifact(collected);
  const artifact = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, "scripts/contracts/current-wire-contract-inventory.json"),
    "utf8",
  ));

  assert.deepEqual(current.counts, {
    mountedRegistrations: 315,
    mountedMethodPaths: 230,
    noInputRoutes: 85,
    requestCarriers: 306,
    policies: {
      reject: 41,
      "accept-and-project": 183,
      passthrough: 18,
      "non-object-applicable": 64,
    },
    responses: { total: 608, json: 544, nonJson: 64 },
    unresolved: 0,
  });
  assert.deepEqual(current, artifact);
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

test("CLI check and write own only the JSON artifact while report renders Markdown to stdout", () => {
  const root = fixture(semanticFixture());
  const markdown = path.join(root, "current-wire-contract-inventory.md");
  fs.writeFileSync(markdown, "independent reviewer notes\n");

  const written = runFixtureCli(root, ["--write"]);
  assert.match(written.stdout, /1 mounted method\/path instances, 1 carriers, 2 response expressions/);
  const jsonPath = path.join(root, "current-wire-contract-inventory.json");
  const json = fs.readFileSync(jsonPath, "utf8");
  const parsed = JSON.parse(json);
  assert.equal(parsed.generation.sourceDigest, undefined);
  assert.match(parsed.generation.semanticDigest, /^[a-f0-9]{64}$/);
  const digestProjection = structuredClone(parsed);
  delete digestProjection.generation.semanticDigest;
  assert.equal(
    parsed.generation.semanticDigest,
    crypto.createHash("sha256").update(JSON.stringify(digestProjection)).digest("hex"),
  );
  assert.equal(fs.readFileSync(markdown, "utf8"), "independent reviewer notes\n");

  assert.doesNotThrow(() => runFixtureCli(root, []));
  fs.rmSync(markdown);
  assert.doesNotThrow(() => runFixtureCli(root, []));

  const jsonBeforeReport = fs.readFileSync(jsonPath);
  const report = runFixtureCli(root, ["--report"]).stdout;
  assert.equal(runFixtureCli(root, ["--report"]).stdout, report);
  assert.deepEqual(fs.readFileSync(jsonPath), jsonBeforeReport);
  assert.match(report, /^# Current API wire inventory/m);
  assert.match(report, /Semantic digest: `[a-f0-9]{64}`/);
  assert.match(report, /All mounted registrations \| 1/);
  assert.equal(fs.existsSync(markdown), false);
});

test("CLI writes deterministic JSON and rejects stale or invalid mode combinations", () => {
  const root = fixture(semanticFixture());
  runFixtureCli(root, ["--write"]);
  const first = fs.readFileSync(path.join(root, "current-wire-contract-inventory.json"));
  runFixtureCli(root, ["--write"]);
  const second = fs.readFileSync(path.join(root, "current-wire-contract-inventory.json"));
  assert.deepEqual(second, first);

  fs.writeFileSync(path.join(root, "current-wire-contract-inventory.json"), "{}\n");
  assert.throws(() => runFixtureCli(root, []), /route inventory is stale/);
  assert.throws(() => runFixtureCli(root, ["--write", "--report"]), /separate route inventory modes/);
  assert.throws(() => runFixtureCli(root, ["--write", "--write"]), /options may only be specified once/);
  assert.throws(() => runFixtureCli(root, ["--unknown"]), /unknown route inventory option/);
});

test("comment-only and unrelated source edits preserve semantic JSON freshness", () => {
  const root = fixture(semanticFixture());
  runFixtureCli(root, ["--write"]);
  const artifactPath = path.join(root, "current-wire-contract-inventory.json");
  const baseline = fs.readFileSync(artifactPath);

  fs.writeFileSync(path.join(root, "app.ts"), `// shifts every source line\n${semanticFixture()}`);
  assert.doesNotThrow(() => runFixtureCli(root, []));

  fs.writeFileSync(path.join(root, "app.ts"), `
    function createRouter() { return {} as any }
    function jsonSchemaValidator(schema: unknown) { return schema }
    function strictRequestObject(value: unknown) { return value }
    function legacyStripRequestObject(value: unknown) { return value }
    export function createApp() {
      const app = createRouter()
      app.post(
        "/items",
        jsonSchemaValidator(legacyStripRequestObject({})),
        async (c: any) => {
          await c.req.json()
          return c.json(({ ok: true }))
        },
      )
      return app
    }
  `);
  assert.doesNotThrow(() => runFixtureCli(root, []));

  fs.writeFileSync(path.join(root, "app.ts"), semanticFixture({
    declarations: "const unused = async (c: any) => { await c.req.json(); return c.json({ ok: true }); };",
  }));
  assert.doesNotThrow(() => runFixtureCli(root, []));

  fs.writeFileSync(path.join(root, "app.ts"), semanticFixture({
    requestRead: "// comment inside the handler\n        await c.req.json();",
  }));
  assert.doesNotThrow(() => runFixtureCli(root, []));

  fs.writeFileSync(path.join(root, "app.ts"), semanticFixture({
    response: "c.json({ /* response comment */ ok: true })",
  }));
  write(root, "unrelated.ts", "// unrelated API source edit\nexport const unrelated = 1;\n");
  assert.doesNotThrow(() => runFixtureCli(root, []));
  runFixtureCli(root, ["--write"]);
  assert.deepEqual(fs.readFileSync(artifactPath), baseline);
});

test("anonymous handler identity preserves distinct handlers and factory calls without false deduplication", () => {
  const root = fixture(`
    function createRouter() { return {} as any }
    async function shared(c: any) { return c.json({ ok: true }); }
    function makeHandler() { return async (c: any) => c.json({ ok: true }); }
    export function createApp() {
      const app = createRouter();
      app.get("/inline", async (c: any) => c.json({ ok: true }));
      app.get("/inline", async (c: any) => c.json({ ok: true }));
      app.get("/shared", shared);
      app.get("/shared", shared);
      app.get("/factory", makeHandler());
      app.get("/factory", makeHandler());
      return app;
    }
  `);
  const inventory = collectRouteInventory(root, { entry: "app.ts", entrySymbol: "createApp" });
  const routesAt = (routePath) => inventory.routes.filter((route) => route.path === routePath);

  assert.equal(routesAt("/inline").length, 2);
  assert.equal(new Set(routesAt("/inline").map((route) => route.handlerSymbol)).size, 2);
  assert.equal(routesAt("/shared").length, 1);
  assert.equal(routesAt("/factory").length, 2);
  assert.equal(new Set(routesAt("/factory").map((route) => route.handlerSymbol)).size, 2);
});

test("route, carrier, policy, response, and non-JSON linkage mutations make JSON stale", async (t) => {
  const mutations = [
    ["mounted route", semanticFixture({ path: '"/renamed"' })],
    ["top-level request carrier", semanticFixture({ requestRead: 'await c.req.json(); c.req.query("mode");' })],
    ["unknown-key policy", semanticFixture({ schema: "strictRequestObject({})" })],
    ["response expression", semanticFixture({ response: "c.json({ ok: false })" })],
    ["non-JSON linkage", semanticFixture({ response: 'c.text("ok")' })],
  ];

  for (const [name, source] of mutations) {
    await t.test(name, () => {
      const root = fixture(semanticFixture());
      runFixtureCli(root, ["--write"]);
      fs.writeFileSync(path.join(root, "app.ts"), source);
      assert.throws(() => runFixtureCli(root, []), /route inventory is stale/);
    });
  }
});

test("response changes after the former display cap and inside string whitespace make JSON stale", async (t) => {
  const prefix = "x".repeat(260);
  const mutations = [
    ["long expression suffix", `c.json({ value: "${prefix}a" })`, `c.json({ value: "${prefix}b" })`],
    ["string whitespace", 'c.json({ value: "a b" })', 'c.json({ value: "a  b" })'],
  ];

  for (const [name, before, after] of mutations) {
    await t.test(name, () => {
      const root = fixture(semanticFixture({ response: before }));
      runFixtureCli(root, ["--write"]);
      fs.writeFileSync(path.join(root, "app.ts"), semanticFixture({ response: after }));
      assert.throws(() => runFixtureCli(root, []), /route inventory is stale/);
    });
  }
});

test("a new source diagnostic fails closed before write or freshness comparison", () => {
  const root = fixture(semanticFixture());
  runFixtureCli(root, ["--write"]);
  fs.writeFileSync(path.join(root, "app.ts"), semanticFixture({
    declarations: "declare function runtimePath(): string;",
    path: "runtimePath()",
  }));
  assert.throws(
    () => runFixtureCli(root, []),
    (error) => error.diagnostics?.some((issue) => issue.message === "unresolved dynamic route path"),
  );
});
