import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const apiRoot = path.resolve(scriptDirectory, "../..")
const repositoryRoot = path.resolve(apiRoot, "../..")
const sourcePath = path.join(apiRoot, "src/ports/wiki-contracts.ts")
const outputPath = path.join(
  repositoryRoot,
  "apps/web/app/lib/api/generated/wiki-contracts.d.ts"
)
const banner =
  "// Generated from @imsweb/api src/ports/wiki-contracts.ts. Do not edit.\n\n"
const generated = `${banner}${fs.readFileSync(sourcePath, "utf8")}`
const check = process.argv.slice(2).includes("--check")

if (check) {
  const current = fs.readFileSync(outputPath, "utf8")
  if (current !== generated) {
    throw new Error(
      "Generated Web API contracts are stale; run " +
        "node apps/api/scripts/contracts/generate-web-contracts.mjs"
    )
  }
  process.stdout.write("Generated Web API contracts are current\n")
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, generated)
  process.stdout.write(`Generated ${path.relative(repositoryRoot, outputPath)}\n`)
}
