import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

const runtimeOutput = /\.[cm]?js$/

/** Package versions and output paths can stay unchanged when a workspace rebuilds. */
export function contractsFingerprint(directory: string): string {
  const hash = createHash("sha256")
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      const file = join(current, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && runtimeOutput.test(entry.name)) {
        hash.update(relative(directory, file).split(sep).join("/"))
        hash.update("\0")
        hash.update(readFileSync(file))
        hash.update("\0")
      }
    }
  }
  if (existsSync(directory)) visit(directory)
  else hash.update("contracts-output-missing")
  return hash.digest("hex")
}
