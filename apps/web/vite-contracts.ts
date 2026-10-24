import { existsSync } from "node:fs"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import type { Plugin } from "vite"

import { contractsFingerprint as contractsDigest } from "./vite-contracts-cache"

export { contractsDigest }

const runtimeOutput = /\.[cm]?js$/

type ContractsWatcher = {
  add(path: string): void
  on(event: "all", listener: (_event: string, path: string) => void): void
  off(event: "all", listener: (_event: string, path: string) => void): void
}

export function watchContracts(
  directory: string,
  watcher: ContractsWatcher,
  restart: (forceOptimize: boolean) => Promise<void>,
  onError: (error: unknown) => void
) {
  const root = resolve(directory)
  let digest = contractsDigest(root)
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const changed = (event: string, file: string) => {
    const path = relative(root, resolve(file))
    if (
      closed ||
      !["add", "change", "unlink"].includes(event) ||
      isAbsolute(path) ||
      path === ".." ||
      path.startsWith(`..${sep}`) ||
      !runtimeOutput.test(file)
    )
      return
    clearTimeout(timer)
    // tsc writes both runtime formats; restart once after the batch settles.
    timer = setTimeout(() => {
      timer = undefined
      if (closed || !existsSync(root)) return
      try {
        const next = contractsDigest(root)
        if (next === digest) return
        digest = next
        void restart(true).catch(onError)
      } catch (error) {
        // A clean build can remove a file between directory and content reads.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") onError(error)
      }
    }, 500)
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
