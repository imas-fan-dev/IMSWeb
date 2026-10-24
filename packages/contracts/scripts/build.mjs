// Compile the contracts package twice: CommonJS for the API's require() path
// and ESM for bundlers and Node's import path. Each output tree gets its own
// package.json "type" marker so Node and TypeScript read the emitted .js and
// .d.ts files in the format they were written for.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventory = JSON.parse(
  readFileSync(path.join(packageRoot, "entrypoints.json"), "utf8"),
);
const requestedFormats = process.argv
  .slice(2)
  .filter((argument) => !argument.startsWith("-"));
const allBuilds = [
  { format: "cjs", config: "tsconfig.cjs.json" },
  { format: "esm", config: "tsconfig.esm.json" },
];
const unknownFormats = requestedFormats.filter(
  (format) => !allBuilds.some((build) => build.format === format),
);
if (unknownFormats.length) {
  throw new Error(`Unknown build format: ${unknownFormats.join(", ")}`);
}
const builds = requestedFormats.length
  ? allBuilds.filter((build) => requestedFormats.includes(build.format))
  : allBuilds;
const tsc = path.join(
  packageRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

if (!existsSync(tsc)) {
  throw new Error(`TypeScript is not installed at ${tsc}; run pnpm install first`);
}

for (const { format, config } of builds) {
  const build = inventory?.build?.[format];
  if (
    !build ||
    typeof build.outDir !== "string" ||
    typeof build.module !== "string"
  ) {
    throw new Error(
      `entrypoints.json must define build.${format}.outDir and build.${format}.module`,
    );
  }
  // Clean first so a failed compile cannot leave a stale tree that the
  // entrypoint checker would accept.
  rmSync(path.join(packageRoot, build.outDir), { recursive: true, force: true });
  // On Windows the TypeScript CLI is a .cmd shim, which Node cannot spawn
  // without a shell.
  const result = spawnSync(
    tsc,
    ["-p", config, "--outDir", build.outDir],
    { cwd: packageRoot, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  mkdirSync(path.join(packageRoot, build.outDir), { recursive: true });
  writeFileSync(
    path.join(packageRoot, build.outDir, "package.json"),
    `${JSON.stringify({ type: build.module }, null, 2)}\n`,
  );
  process.stdout.write(`Built ${build.outDir} (${build.module})\n`);
}
