// pnpm runs `prepare` on every install, including Docker layers that copy only
// package manifests. Build the contracts dist only when sources are present so
// manifest-only installs succeed; full checkouts always produce dist/.
import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = dirname(fileURLToPath(import.meta.url))
if (existsSync(join(packageRoot, "src/wiki.ts"))) {
  const result = spawnSync("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], {
    cwd: packageRoot,
    stdio: "inherit",
  })
  process.exit(result.status ?? 1)
}
