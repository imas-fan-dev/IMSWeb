import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateManifest } from "../../scripts/contracts/check-non-json-boundaries.mjs";

function write(root, name, content) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "non-json-boundaries-"));
  write(root, "packages/contracts/src/errors.ts", "export const mediaHttpErrorSchema = {};\n");
  write(root, "apps/api/src/app.ts", [
    "import { registerDemoRoutes } from './domains/demo/routes';",
    "export function createHonoApp(app) { registerDemoRoutes(app); return app; }",
  ].join("\n"));
  write(root, "apps/api/src/domains/demo/handlers/demo.ts", [
    "export function handleBinary(c) { if (!c.req) return c.json({ error: 'missing' }, 400); return c.body('bytes'); }",
    "export function handleRedirect(c) { return c.redirect('/next', 302); }",
    "export function handleHtml(c) { return c.html('<p>ok</p>'); }",
    "export function createHandleStatic() { return (c) => c.text('Not Found', 404); }",
    "export function handleNoContent(c) { return c.body(null, 204); }",
  ].join("\n"));
  write(root, "apps/api/src/domains/demo/routes.ts", [
    "import { handleBinary as binary, handleRedirect, handleHtml, createHandleStatic, handleNoContent } from './handlers/demo';",
    "export function registerDemoRoutes(app) {",
    "  app.get('/binary', binary);",
    "  app.get('/redirect', handleRedirect);",
    "  app.get('/html', handleHtml);",
    "  app.get('/static', createHandleStatic());",
    "  app.get('/empty', handleNoContent);",
    "}",
  ].join("\n"));
  write(root, "apps/web/app/lib/api/bundle.ts", "export function getBundleAsset() { return '/maps/boundary.json'; }\n");
  write(root, "tests/focused.test.js", [
    "function assertStaticEvidence() { assert.ok(true); }",
    "test('binary evidence', () => { assert.ok(true); });",
    "test('redirect evidence', () => { assert.ok(true); });",
    "test('html evidence', () => { assert.ok(true); });",
    "test('static evidence', () => { assertStaticEvidence(); });",
    "test('empty evidence', () => { assert.ok(true); });",
    "test('bundle evidence', () => { assert.ok(true); });",
  ].join("\n"));
  return root;
}

function entry(id, symbol, responseKind, testSymbol, extra = {}) {
  return {
    id,
    sourceFile: "apps/api/src/domains/demo/handlers/demo.ts",
    symbol,
    responseKind,
    reason: "Focused fixture boundary.",
    jsonErrorSchema: { sourceFile: "packages/contracts/src/errors.ts", symbol: "mediaHttpErrorSchema" },
    test: { file: "tests/focused.test.js", symbol: testSymbol },
    ...extra,
  };
}

function errors(root, boundaries) {
  return validateManifest(root, { boundaries }).errors;
}

test("accepts compiler-resolved aliases, mixed JSON errors, factory handlers, and static assets", () => {
  const root = fixture();
  const boundaries = [
    entry("FIXTURE-BINARY-01", "handleBinary", "binary", "binary evidence"),
    entry("FIXTURE-REDIRECT-01", "handleRedirect", "redirect", "redirect evidence"),
    entry("FIXTURE-HTML-01", "handleHtml", "html", "html evidence"),
    entry("FIXTURE-STATIC-01", "createHandleStatic", "compatibility-text-error", "static evidence", {
      jsonErrorSchema: undefined,
      compatibilityTextError: {
        body: "Not Found",
        status: 404,
        contentType: "text/plain; charset=UTF-8",
        justification: "C5 fixture compatibility text.",
      },
    }),
    entry("FIXTURE-NOCONTENT-01", "handleNoContent", "no-content", "empty evidence"),
    {
      ...entry("FIXTURE-WEB-BUNDLE-01", "getBundleAsset", "static", "bundle evidence"),
      sourceFile: "apps/web/app/lib/api/bundle.ts",
      nonApiStaticAsset: { path: "/maps/boundary.json" },
    },
  ];
  assert.deepEqual(errors(root, boundaries), []);
});

test("rejects stale symbols, tests, schema provenance, C5 evidence, and duplicate response kinds", () => {
  const root = fixture();
  assert.match(errors(root, [entry("FIXTURE-STALE-SYMBOL-01", "handleMissing", "binary", "binary evidence")]).join("\n"), /symbol is not live/);
  assert.match(errors(root, [{ ...entry("FIXTURE-STALE-TEST-01", "handleBinary", "binary", "missing evidence") }]).join("\n"), /focused test case must be live and contain an assertion/);
  assert.match(errors(root, [{ ...entry("FIXTURE-STALE-SCHEMA-01", "handleBinary", "binary", "binary evidence"), jsonErrorSchema: { sourceFile: "packages/contracts/src/errors.ts", symbol: "missingErrorSchema" } }]).join("\n"), /JSON error schema is not live/);
  assert.match(errors(root, [{ ...entry("FIXTURE-BAD-C5-01", "createHandleStatic", "compatibility-text-error", "static evidence"), jsonErrorSchema: undefined, compatibilityTextError: { body: "Not Found", status: 404, contentType: "text/plain", justification: "C5 fixture" } }]).join("\n"), /compatibility text error requires/);
  assert.match(errors(root, [entry("FIXTURE-DUPLICATE-01", "handleBinary", "binary", "binary evidence"), entry("FIXTURE-DUPLICATE-02", "handleBinary", "binary", "binary evidence")]).join("\n"), /duplicate file\+symbol/);
});

test("rejects title-only focused tests and incompatible explicit text content types", () => {
  const root = fixture();
  write(root, "tests/focused.test.js", "test('title only', () => {});\n");
  assert.match(
    errors(root, [entry("FIXTURE-TITLE-ONLY-01", "handleBinary", "binary", "title only")]).join("\n"),
    /must be live and contain an assertion/,
  );

  write(root, "apps/api/src/domains/demo/handlers/demo.ts", [
    "export function handleBinary(c) { if (!c.req) return c.json({ error: 'missing' }, 400); return c.body('bytes'); }",
    "export function handleRedirect(c) { return c.redirect('/next', 302); }",
    "export function handleHtml(c) { return c.html('<p>ok</p>'); }",
    "export function createHandleStatic() { return (c) => c.text('Not Found', 404, { headers: { 'Content-Type': 'text/html' } }); }",
    "export function handleNoContent(c) { return c.body(null, 204); }",
  ].join("\n"));
  write(root, "tests/focused.test.js", "test('static evidence', () => { assert.ok(true); });\n");
  assert.match(
    errors(root, [entry("FIXTURE-BAD-CONTENT-TYPE-01", "createHandleStatic", "compatibility-text-error", "static evidence", {
      jsonErrorSchema: undefined,
      compatibilityTextError: { body: "Not Found", status: 404, contentType: "text/plain; charset=UTF-8", justification: "C5 fixture" },
    })]).join("\n"),
    /body\/status are not proven/,
  );
});

test("rejects unregistered handlers, unreachable manifest entries, wildcards, and local inline handlers", () => {
  const root = fixture();
  const unregistered = errors(root, [entry("FIXTURE-ONLY-01", "handleBinary", "binary", "binary evidence")]).join("\n");
  assert.match(unregistered, /unregistered non-JSON handler/);
  assert.match(errors(root, [{ ...entry("FIXTURE-WILDCARD-01", "handle*", "binary", "binary evidence"), sourceFile: "apps/api/src/domains/demo/*.ts" }]).join("\n"), /without wildcards/);

  write(root, "apps/api/src/domains/demo/routes.ts", [
    "import { handleBinary as binary, handleRedirect, handleHtml, createHandleStatic, handleNoContent } from './handlers/demo';",
    "export function registerDemoRoutes(app) {",
    "  app.get('/binary', binary); app.get('/redirect', handleRedirect); app.get('/html', handleHtml);",
    "  app.get('/static', createHandleStatic()); app.get('/empty', handleNoContent);",
    "  app.get('/inline', (c) => c.text('inline', 200));",
    "}",
  ].join("\n"));
  const all = [
    entry("FIXTURE-BINARY-01", "handleBinary", "binary", "binary evidence"),
    entry("FIXTURE-REDIRECT-01", "handleRedirect", "redirect", "redirect evidence"),
    entry("FIXTURE-HTML-01", "handleHtml", "html", "html evidence"),
    entry("FIXTURE-STATIC-01", "createHandleStatic", "compatibility-text-error", "static evidence", { jsonErrorSchema: undefined, compatibilityTextError: { body: "Not Found", status: 404, contentType: "text/plain; charset=UTF-8", justification: "C5 fixture" } }),
    entry("FIXTURE-NOCONTENT-01", "handleNoContent", "no-content", "empty evidence"),
  ];
  assert.match(errors(root, all).join("\n"), /unmanifested local inline non-JSON handler/);
});
