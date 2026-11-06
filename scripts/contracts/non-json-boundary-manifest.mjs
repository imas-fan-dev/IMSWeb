import fs from "node:fs";
import path from "node:path";

export const nonJsonBoundaryManifestPath = "scripts/contracts/non-json-boundaries.manifest.json";

export function loadNonJsonBoundaryManifest(repositoryRoot) {
  const file = path.join(repositoryRoot, nonJsonBoundaryManifestPath);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(manifest.boundaries)) {
    throw new Error(`${nonJsonBoundaryManifestPath}: boundaries must be an array`);
  }
  return manifest;
}

export function findNonJsonBoundary(entries, { sourceFile, symbol, responseKind }) {
  return entries.find((entry) =>
    entry.sourceFile === sourceFile
    && entry.symbol === symbol
    && (responseKind === undefined || entry.responseKind === responseKind),
  );
}

// This exact lookup is shared with source-audit callers. It intentionally has
// no wildcard or prefix behavior, so audit results remain tied to one live
// handler boundary.
export function loadExactNonJsonBoundary(repositoryRoot, identity) {
  return findNonJsonBoundary(loadNonJsonBoundaryManifest(repositoryRoot).boundaries, identity);
}

export function hasNonJsonBoundary(entries, identity) {
  return Boolean(findNonJsonBoundary(entries, identity));
}
