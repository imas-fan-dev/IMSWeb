import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve, sep } from "node:path"

import type { Plugin } from "vite"

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

/** Re-optimize only after a contracts build finishes its burst of runtime writes. */
export function contractsDependencyCache(directory: string): Plugin {
  const root = resolve(directory)
  let dispose = () => {}
  return {
    name: "imsweb-contracts-dependency-cache",
    apply: "serve",
    configureServer(server) {
      let currentFingerprint = contractsFingerprint(root)
      let pending: ReturnType<typeof setTimeout> | undefined
      const onOutputChange = (event: string, file: string) => {
        const child = relative(root, resolve(file))
        if (
          !["add", "change", "unlink"].includes(event) ||
          !runtimeOutput.test(file) ||
          isAbsolute(child) ||
          child === ".." ||
          child.startsWith(`..${sep}`)
        )
          return
        clearTimeout(pending)
        pending = setTimeout(() => {
          pending = undefined
          // A clean rebuild may remove the whole directory before compiling.
          if (!existsSync(root)) return
          let nextFingerprint: string
          try {
            nextFingerprint = contractsFingerprint(root)
          } catch (error) {
            // A clean build can remove an output between directory and file reads.
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
              server.config.logger.error(
                `Contracts dependency fingerprint failed: ${String(error)}`
              )
            }
            return
          }
          if (nextFingerprint === currentFingerprint) return
          currentFingerprint = nextFingerprint
          void server.restart().catch((error: unknown) => {
            server.config.logger.error(
              `Contracts dependency cache restart failed: ${String(error)}`
            )
          })
        }, 500)
      }
      server.watcher.add(root)
      server.watcher.on("all", onOutputChange)
      dispose = () => {
        clearTimeout(pending)
        server.watcher.off("all", onOutputChange)
      }
    },
    closeBundle() {
      dispose()
    },
  }
}
