import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  renderFrontendRouteMetadata,
  runFrontendRouteMetadataCli,
} from "../compile-frontend-route-metadata.mjs";

const fixtureSource = `
export const routeDescriptors = [
  { index: true, file: "pages/index.tsx", layout: "public", targets: ["web", "app"], delivery: "prerender", prerender: ["/"] },
  { path: "items", file: "pages/items.tsx", layout: "public", targets: ["web", "app"], delivery: "prerender", prerender: ["/items"] },
  { path: "items/:itemId", file: "pages/item.tsx", layout: "public", targets: ["web", "app"], delivery: "spa" },
  { path: "web-only", file: "pages/web-only.tsx", layout: "standalone", targets: ["web"], delivery: "prerender", prerender: ["/web-only"] },
]
export function prerenderRoutesForTarget(target) {
  return routeDescriptors.filter((route) => route.targets.includes(target)).flatMap((route) => route.prerender ?? [])
}
export function spaFallbackPatternsForTarget(target) {
  return target === "web" || target === "app"
    ? [{ id: "items/:itemId", match: "prefix", path: "/items", segments: ["items"], segmentCount: 2 }]
    : []
}
`;

function validMetadata(overrides = {}) {
  const routeDescriptors = [
    {
      index: true,
      file: "pages/index.tsx",
      layout: "public",
      targets: ["web", "app"],
      delivery: "prerender",
      prerender: ["/"],
    },
  ];
  return {
    routeDescriptors,
    prerenderRoutesForTarget: () => ["/"],
    spaFallbackPatternsForTarget: () => [],
    ...overrides,
  };
}

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "imsweb-frontend-routes-"),
  );
  const source = path.join(root, "route-metadata.ts");
  const output = path.join(root, "frontend-route-delivery.ts");
  fs.writeFileSync(source, fixtureSource);
  return { root, source, output };
}

async function runFixture(paths, arguments_) {
  return runFrontendRouteMetadataCli(arguments_, {
    ...paths,
    writeStdout() {},
  });
}

test("writes deterministic TypeScript and accepts a current artifact", async () => {
  const paths = fixture();
  await runFixture(paths, ["--write"]);
  const first = fs.readFileSync(paths.output);
  await runFixture(paths, ["--write"]);
  assert.deepEqual(fs.readFileSync(paths.output), first);
  await assert.doesNotReject(runFixture(paths, []));
  assert.match(first.toString(), /\['\/web-only', 'web-only\/index\.html'\]/);
});

test("rejects missing and stale generated metadata", async () => {
  const paths = fixture();
  await assert.rejects(runFixture(paths, []), /metadata is stale/);
  await runFixture(paths, ["--write"]);
  fs.writeFileSync(
    paths.source,
    fixtureSource.replaceAll("web-only", "changed"),
  );
  await assert.rejects(runFixture(paths, []), /metadata is stale/);
});

test("rejects invalid modes and invalid metadata", async () => {
  const paths = fixture();
  await assert.rejects(
    runFixture(paths, ["--unknown"]),
    /unknown frontend route metadata option/,
  );
  await assert.rejects(
    runFixture(paths, ["--write", "--write"]),
    /only be specified once/,
  );
  assert.throws(
    () =>
      renderFrontendRouteMetadata(
        validMetadata({
          routeDescriptors: [
            {
              path: "duplicate",
              file: "pages/duplicate.tsx",
              layout: "public",
              targets: ["web", "app"],
              delivery: "prerender",
              prerender: ["/duplicate", "/duplicate"],
            },
          ],
          prerenderRoutesForTarget: () => ["/duplicate", "/duplicate"],
        }),
      ),
    /duplicate/,
  );
});

test("rejects omitted prerenders and mismatched SPA patterns", () => {
  assert.throws(
    () =>
      renderFrontendRouteMetadata(
        validMetadata({ prerenderRoutesForTarget: () => [] }),
      ),
    /prerender derivation omitted/,
  );
  assert.throws(
    () =>
      renderFrontendRouteMetadata(
        validMetadata({
          routeDescriptors: [
            {
              path: "items/:itemId",
              file: "pages/item.tsx",
              layout: "public",
              targets: ["web", "app"],
              delivery: "spa",
            },
          ],
          prerenderRoutesForTarget: () => [],
        }),
      ),
    /do not match route descriptors/,
  );
  assert.throws(
    () =>
      renderFrontendRouteMetadata(
        validMetadata({
          routeDescriptors: [
            {
              path: "items/:itemId",
              file: "pages/item.tsx",
              layout: "public",
              targets: ["web", "app"],
              delivery: "spa",
            },
          ],
          prerenderRoutesForTarget: () => [],
          spaFallbackPatternsForTarget: () => [
            {
              id: "items/:itemId",
              match: "prefix",
              path: "/items",
              segments: ["items"],
            },
          ],
        }),
      ),
    /does not match its route descriptor/,
  );
});

test("accepts an order-independent exact SPA pattern set", () => {
  const rendered = renderFrontendRouteMetadata({
    routeDescriptors: [
      {
        path: "first/:firstId",
        file: "pages/first.tsx",
        layout: "public",
        targets: ["web", "app"],
        delivery: "spa",
      },
      {
        path: "second/:secondId",
        file: "pages/second.tsx",
        layout: "public",
        targets: ["web", "app"],
        delivery: "spa",
      },
    ],
    prerenderRoutesForTarget: () => [],
    spaFallbackPatternsForTarget: () => [
      {
        id: "second/:secondId",
        match: "prefix",
        path: "/second",
        segments: ["second"],
        segmentCount: 2,
      },
      {
        id: "first/:firstId",
        match: "prefix",
        path: "/first",
        segments: ["first"],
        segmentCount: 2,
      },
    ],
  });

  assert.ok(
    rendered.indexOf("id: 'first/:firstId'") <
      rendered.indexOf("id: 'second/:secondId'"),
  );
});

test("the tracked API artifact matches the Web descriptor", async () => {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  await assert.doesNotReject(
    runFrontendRouteMetadataCli([], { root, writeStdout() {} }),
  );
});
