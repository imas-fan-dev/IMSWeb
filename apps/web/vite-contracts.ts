import { statSync } from "node:fs"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import type { Plugin } from "vite"

import { contractsFingerprint as contractsDigest } from "./vite-contracts-cache"

export { contractsDigest }

const runtimeOutput = /\.[cm]?js$/

/**
 * Vite's dependency scanner reads these entrypoints while re-optimizing. The
 * contracts build clears `dist` before rewriting it, so a server restarted in
 * that window dies with `ENOENT ... dist/esm/index.js` and never comes back.
 */
const DIST_PROBES = ["esm/index.js", "esm/paths.js", "cjs/index.js"]

export function contractsDistReady(root: string): boolean {
  return DIST_PROBES.every((relative) => {
    try {
      return statSync(join(root, relative)).size > 0
    } catch {
      return false
    }
  })
}

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
  let restarting = false
  let queued = false
  let lastRestartAt = 0
  // Restarting mid-re-optimization leaves the dev server listening but unable
  // to answer document requests, so restarts are serialized and spaced out.
  const RESTART_INTERVAL_MS = 5_000
  const runRestart = async () => {
    if (closed) return
    if (!contractsDistReady(root)) {
      // Rebuild still in flight; scanning it now kills the server.
      timer = setTimeout(() => void runRestart(), 1000)
      return
    }
    if (restarting) {
      queued = true
      return
    }
    const wait = lastRestartAt + RESTART_INTERVAL_MS - Date.now()
    if (wait > 0) {
      timer = setTimeout(() => void runRestart(), wait)
      return
    }
    restarting = true
    lastRestartAt = Date.now()
    try {
      await restart(true)
    } catch (error) {
      onError(error)
    } finally {
      restarting = false
      if (!closed) {
        if (queued) {
          queued = false
          timer = setTimeout(() => void runRestart(), RESTART_INTERVAL_MS)
        } else {
          // tsc keeps writing while the server restarts, so the bundle that
          // restart produced can still predate the last file. Check again once
          // the restart has settled instead of trusting the first comparison.
          timer = setTimeout(verify, 2000)
        }
      }
    }
  }
  const verify = () => {
    if (closed) return
    if (!contractsDistReady(root)) {
      timer = setTimeout(verify, 1000)
      return
    }
    try {
      const next = contractsDigest(root)
      if (next === digest) return
      digest = next
      void runRestart()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        timer = setTimeout(verify, 1000)
      } else {
        onError(error)
      }
    }
  }
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
    // tsc writes dozens of runtime files over several seconds. Restarting on a
    // partial build re-optimizes against a half-written dist and can wedge the
    // server, so wait for a quiet gap first.
    timer = setTimeout(verify, 1200)
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
