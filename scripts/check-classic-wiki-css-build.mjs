import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const clientRoot = path.join(repositoryRoot, "apps/web/build/client");
const classicHtmlPath = path.join(clientRoot, "wiki/classic/index.html");
if (process.env.VITE_IMS_APP_TARGET === "app") {
  console.log("[skip] Classic Wiki CSS is excluded from the app target");
} else {
  const classicHtml = await readFile(classicHtmlPath, "utf8");
  const stylesheetLinks = classicHtml.match(/<link\b[^>]*>/g) ?? [];
  const classicStylesheets = [];

  for (const link of stylesheetLinks) {
    if (!/\brel=["']stylesheet["']/.test(link)) continue;
    const href = link.match(/\bhref=["']([^"']+)["']/)?.[1];
    if (!href?.startsWith("/assets/") || !href.endsWith(".css")) continue;

    const stylesheetPath = path.join(clientRoot, href.slice(1));
    const stylesheet = await readFile(stylesheetPath, "utf8");
    if (stylesheet.includes(".wiki-classic-shell")) {
      classicStylesheets.push({ href, stylesheet });
    }
  }

  assert.equal(
    classicStylesheets.length,
    1,
    "The classic Wiki route must bundle its base and override rules into one CSS asset",
  );

  const [{ href, stylesheet }] = classicStylesheets;
  const baseRule = stylesheet.indexOf("--classic-ink:#32343a");
  const overrideRule = stylesheet.indexOf("--classic-ink:#292a2f");

  assert.notEqual(baseRule, -1, `Missing classic base rules in ${href}`);
  assert.ok(
    overrideRule > baseRule,
    `Classic override rules must follow the base rules in ${href}`,
  );
  assert.match(stylesheet, /wiki-classic-background-in/);
  assert.match(stylesheet, /transform \.4s cubic-bezier\(\.34,1\.56,\.64,1\)/);

  console.log(`[ok] Classic Wiki CSS cascade is stable in ${href}`);
}
