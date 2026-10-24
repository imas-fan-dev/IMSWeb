import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { isAbsolute, join, relative } from "node:path"
import type { Plugin } from "vite"

/** Vite's lockfile hash does not include our linked contracts runtime bytes. */
export function contractsDigest(root: string): string {
  const hash = createHash("sha256")
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name)
    )) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && entry.name.endsWith(".js")) {
        hash.update(relative(root, file))
        hash.update("\0")
        hash.update(readFileSync(file))
        hash.update("\0")
      }
    }
  }
  visit(root)
  return hash.digest("hex")
}

type ContractsWatcher = {
  add(path: string): void
  on(event: "all", listener: (_event: string, path: string) => void): void
  off(event: "all", listener: (_event: string, path: string) => void): void
}

export function watchContracts(
  root: string,
  watcher: ContractsWatcher,
  restart: (forceOptimize: boolean) => Promise<void>,
  onError: (error: unknown) => void
) {
  let digest = contractsDigest(root)
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const changed = (_event: string, file: string) => {
    const path = relative(root, file)
    if (
      closed ||
      isAbsolute(path) ||
      path.startsWith("..") ||
      !file.endsWith(".js")
    )
      return
    clearTimeout(timer)
    // tsc writes multiple runtime files; restart once after the batch settles.
    timer = setTimeout(() => {
      if (closed) return
      try {
        const next = contractsDigest(root)
        if (next === digest) return
        digest = next
        void restart(true).catch(onError)
      } catch (error) {
        onError(error)
      }
    }, 300)
  }
  watcher.add(root)
  watcher.on("all", changed)
  return () => {
    closed = true
    clearTimeout(timer)
    watcher.off("all", changed)
  }
}

export function localContractsOptimizer(workspaceRoot: string): Plugin {
  const root = join(workspaceRoot, "packages/contracts/dist")
  let cleanup: (() => void) | undefined
  return {
    name: "imsweb-local-contracts-optimizer",
    apply: "serve",
    config() {
      return {
        optimizeDeps: {
          rolldownOptions: {
            transform: {
              // An unused define participates in Vite's optimizer config hash.
              define: {
                __IMS_CONTRACTS_RUNTIME_DIGEST__: JSON.stringify(
                  contractsDigest(root)
                ),
              },
            },
          },
        },
      }
    },
    configureServer(server) {
      cleanup = watchContracts(
        root,
        server.watcher,
        (force) => server.restart(force),
        () =>
          server.config.logger.error(
            "Contracts changed but Vite could not refresh; rebuild contracts and restart Web."
          )
      )
    },
    closeBundle() {
      cleanup?.()
      cleanup = undefined
    },
  }
}
