import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
let importSequence = 0;

function defaultPaths(root) {
  return {
    source: path.join(root, "apps/web/app/route-metadata.ts"),
    output: path.join(root, "apps/api/src/routing/frontend-route-delivery.ts"),
  };
}

function assertUnique(values, label) {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length) {
    throw new Error(
      `${label} contains duplicate ${JSON.stringify(duplicates[0])}`,
    );
  }
}

function descriptorManifestPath(descriptor) {
  const child = descriptor.index ? "" : descriptor.path;
  return descriptor.layout === "admin"
    ? ["admin", child].filter(Boolean).join("/")
    : child || "/";
}

function descriptorOwnsPrerender(descriptor, prerender) {
  const manifestPath = descriptorManifestPath(descriptor);
  if (manifestPath === "/") return prerender === "/";
  const routeSegments = manifestPath.split("/");
  const prerenderSegments = prerender.slice(1).split("/");
  return (
    routeSegments.length === prerenderSegments.length &&
    routeSegments.every(
      (segment, index) =>
        segment.startsWith(":") || segment === prerenderSegments[index],
    )
  );
}

function expectedSpaFallbackPatterns(routeDescriptors) {
  const webSpaRoutes = routeDescriptors.filter(
    (descriptor) =>
      descriptor.delivery === "spa" && descriptor.targets.includes("web"),
  );
  const hasAdminRoutes = webSpaRoutes.some(
    (descriptor) => descriptor.layout === "admin",
  );
  const patterns = hasAdminRoutes
    ? [
        {
          id: "admin",
          match: "prefix",
          path: "/admin",
          segments: ["admin"],
        },
      ]
    : [];

  for (const descriptor of webSpaRoutes) {
    if (descriptor.layout === "admin" || !descriptor.path) continue;
    const routeSegments = descriptor.path.split("/");
    if (hasAdminRoutes && routeSegments[0] === "admin") continue;
    const parameterIndex = routeSegments.findIndex((segment) =>
      segment.startsWith(":"),
    );
    if (
      parameterIndex !== -1 &&
      routeSegments
        .slice(parameterIndex)
        .some((segment) => !segment.startsWith(":"))
    ) {
      throw new Error(
        `SPA route ${descriptor.path} has static segments after a parameter`,
      );
    }
    const segments =
      parameterIndex === -1
        ? routeSegments
        : routeSegments.slice(0, parameterIndex);
    patterns.push({
      id: descriptor.path,
      match: parameterIndex === -1 ? "exact" : "prefix",
      path: `/${segments.join("/")}`,
      segments,
      ...(parameterIndex === -1 ? {} : { segmentCount: routeSegments.length }),
    });
  }

  return patterns;
}

function canonicalSpaPattern(pattern) {
  return JSON.stringify({
    id: pattern.id,
    match: pattern.match,
    path: pattern.path,
    segments: pattern.segments,
    ...(pattern.segmentCount === undefined
      ? {}
      : { segmentCount: pattern.segmentCount }),
  });
}

function validateMetadata(metadata) {
  if (!Array.isArray(metadata.routeDescriptors)) {
    throw new Error("routeDescriptors must be an array");
  }
  if (
    typeof metadata.prerenderRoutesForTarget !== "function" ||
    typeof metadata.spaFallbackPatternsForTarget !== "function"
  ) {
    throw new Error("route metadata derivation functions are missing");
  }

  for (const descriptor of metadata.routeDescriptors) {
    const hasIndex = descriptor.index === true;
    const hasPath = typeof descriptor.path === "string";
    if (
      !descriptor ||
      typeof descriptor.file !== "string" ||
      !/^[^/\\][^\\]*\.[cm]?[jt]sx?$/.test(descriptor.file) ||
      descriptor.file
        .split("/")
        .some((segment) => ["", ".", ".."].includes(segment)) ||
      !["public", "standalone", "admin"].includes(descriptor.layout) ||
      !["prerender", "spa", "none"].includes(descriptor.delivery) ||
      !Array.isArray(descriptor.targets) ||
      descriptor.targets.length === 0 ||
      descriptor.targets.some((target) => !["web", "app"].includes(target)) ||
      hasIndex === hasPath ||
      (hasPath &&
        (descriptor.path.startsWith("/") ||
          descriptor.path.endsWith("/") ||
          descriptor.path
            .split("/")
            .some(
              (segment) => !segment || segment === "." || segment === "..",
            )))
    ) {
      throw new Error(
        `invalid route descriptor: ${JSON.stringify(descriptor)}`,
      );
    }
    assertUnique(descriptor.targets, `targets for ${descriptor.file}`);
    const prerenders = descriptor.prerender ?? [];
    if (
      !Array.isArray(prerenders) ||
      (descriptor.delivery === "prerender") !== prerenders.length > 0
    ) {
      throw new Error(
        `route ${descriptorManifestPath(descriptor)} has inconsistent prerender delivery`,
      );
    }
    for (const prerender of prerenders) {
      if (
        typeof prerender !== "string" ||
        !/^\/(?:[^/?#\\\u0000-\u001f\u007f]+(?:\/[^/?#\\\u0000-\u001f\u007f]+)*)?$/.test(
          prerender,
        ) ||
        prerender.includes(":") ||
        !descriptorOwnsPrerender(descriptor, prerender)
      ) {
        throw new Error(
          `route ${descriptorManifestPath(descriptor)} does not own prerender ${prerender}`,
        );
      }
    }
  }

  for (const target of ["web", "app"]) {
    assertUnique(
      metadata.routeDescriptors
        .filter((descriptor) => descriptor.targets.includes(target))
        .map(descriptorManifestPath),
      `${target} manifest paths`,
    );
  }

  const webPrerenders = metadata.prerenderRoutesForTarget("web");
  const appPrerenders = metadata.prerenderRoutesForTarget("app");
  const spaFallbackPatterns = metadata.spaFallbackPatternsForTarget("web");
  const expectedSpaPatterns = expectedSpaFallbackPatterns(
    metadata.routeDescriptors,
  );
  for (const [target, actual] of [
    ["web", webPrerenders],
    ["app", appPrerenders],
  ]) {
    const expected = metadata.routeDescriptors
      .filter((descriptor) => descriptor.targets.includes(target))
      .flatMap((descriptor) => descriptor.prerender ?? []);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `${target} prerender derivation omitted or reordered routes`,
      );
    }
  }
  assertUnique(webPrerenders, "Web prerenders");
  assertUnique(appPrerenders, "App prerenders");
  assertUnique(
    spaFallbackPatterns.map(({ id }) => id),
    "SPA fallback pattern ids",
  );
  assertUnique(
    spaFallbackPatterns.map(({ path }) => path),
    "SPA fallback pattern paths",
  );

  for (const route of appPrerenders) {
    if (!webPrerenders.includes(route)) {
      throw new Error(`App prerender is not available to Web: ${route}`);
    }
  }
  for (const pattern of spaFallbackPatterns) {
    if (
      !pattern.id ||
      !["exact", "prefix"].includes(pattern.match) ||
      !pattern.path.startsWith("/") ||
      !Array.isArray(pattern.segments) ||
      pattern.segments.length === 0 ||
      pattern.path !== `/${pattern.segments.join("/")}` ||
      (pattern.segmentCount !== undefined &&
        (!Number.isInteger(pattern.segmentCount) ||
          pattern.segmentCount < pattern.segments.length))
    ) {
      throw new Error(
        `invalid SPA fallback pattern: ${JSON.stringify(pattern)}`,
      );
    }
  }

  const patternsById = new Map(
    spaFallbackPatterns.map((pattern) => [pattern.id, pattern]),
  );
  if (patternsById.size !== expectedSpaPatterns.length) {
    throw new Error("SPA fallback patterns do not match route descriptors");
  }
  for (const expected of expectedSpaPatterns) {
    const actual = patternsById.get(expected.id);
    if (
      actual === undefined ||
      canonicalSpaPattern(actual) !== canonicalSpaPattern(expected)
    ) {
      throw new Error(
        `SPA fallback pattern ${expected.id} does not match its route descriptor`,
      );
    }
  }

  return {
    webPrerenders,
    appPrerenders,
    spaFallbackPatterns: expectedSpaPatterns,
  };
}

function quote(value) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function prerenderAsset(route) {
  return route === "/" ? "index.html" : `${route.slice(1)}/index.html`;
}

export function renderFrontendRouteMetadata(metadata) {
  const { webPrerenders, spaFallbackPatterns } = validateMetadata(metadata);
  const prerenders = webPrerenders.map(
    (route) =>
      `    Object.freeze([${quote(route)}, ${quote(prerenderAsset(route))}] as const),`,
  );
  const patterns = spaFallbackPatterns.map((pattern) => {
    const fields = [
      `id: ${quote(pattern.id)}`,
      `match: ${quote(pattern.match)}`,
      `path: ${quote(pattern.path)}`,
      `segments: Object.freeze([${pattern.segments.map(quote).join(", ")}] as const)`,
    ];
    if (pattern.segmentCount !== undefined) {
      fields.push(`segmentCount: ${pattern.segmentCount}`);
    }
    return `    Object.freeze({ ${fields.join(", ")} } as const),`;
  });

  return [
    "// Generated by scripts/contracts/compile-frontend-route-metadata.mjs.",
    "// Do not edit by hand.",
    "",
    "export const FRONTEND_PRERENDERED_ROUTES = Object.freeze([",
    ...prerenders,
    "] as const);",
    "",
    "export const FRONTEND_SPA_FALLBACK_PATTERNS = Object.freeze([",
    ...patterns,
    "] as const);",
    "",
  ].join("\n");
}

async function loadMetadata(source) {
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`frontend route metadata source is missing: ${source}`);
  }
  importSequence += 1;
  return import(`${pathToFileURL(source).href}?compile=${importSequence}`);
}

export async function runFrontendRouteMetadataCli(arguments_, options = {}) {
  const supported = new Set(["--write"]);
  const unknown = arguments_.filter((argument) => !supported.has(argument));
  if (unknown.length) {
    throw new Error(`unknown frontend route metadata option: ${unknown[0]}`);
  }
  if (new Set(arguments_).size !== arguments_.length) {
    throw new Error(
      "frontend route metadata options may only be specified once",
    );
  }

  const root = options.root ?? repositoryRoot;
  const defaults = defaultPaths(root);
  const source = options.source ?? defaults.source;
  const output = options.output ?? defaults.output;
  const metadata = options.metadata ?? (await loadMetadata(source));
  const rendered = renderFrontendRouteMetadata(metadata);
  const writeStdout =
    options.writeStdout ?? ((value) => process.stdout.write(value));

  if (arguments_.includes("--write")) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, rendered);
  } else if (
    !fs.existsSync(output) ||
    fs.readFileSync(output, "utf8") !== rendered
  ) {
    throw new Error(
      "frontend route metadata is stale; run node --experimental-strip-types scripts/contracts/compile-frontend-route-metadata.mjs --write",
    );
  }

  writeStdout(
    `frontend route metadata: ${metadata.prerenderRoutesForTarget("web").length} Web prerenders, ${metadata.prerenderRoutesForTarget("app").length} App prerenders, ${metadata.spaFallbackPatternsForTarget("web").length} SPA patterns\n`,
  );
  return rendered;
}

const invokedAsCli =
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(fileURLToPath(import.meta.url));

if (invokedAsCli) {
  try {
    await runFrontendRouteMetadataCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
