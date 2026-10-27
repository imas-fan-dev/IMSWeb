/**
 * React Router's dev type generator rewrites `apps/web/.react-router/types` on
 * every config load. When the contracts watcher restarts the server while the
 * previous instance is still writing, the losing writer hits
 * `ENOTEMPTY: directory not empty, rmdir .../.react-router/types` and, because
 * that rejection is unhandled inside the framework, the whole dev server dies
 * with exit code 1. The types are regenerated on the next boot anyway, so the
 * race is noise — swallow exactly that error and let every other rejection keep
 * its default behaviour.
 */
const ROUTER_TYPES_PATH = /[\\/]\.react-router[\\/]types([\\/]|$)/

function isRouterTypesRace(reason: unknown): boolean {
  if (typeof reason !== "object" || reason === null) return false
  const { code, path, message } = reason as {
    code?: unknown
    path?: unknown
    message?: unknown
  }
  if (code !== "ENOTEMPTY" && code !== "ENOENT" && code !== "EPERM")
    return false
  if (typeof path === "string") return ROUTER_TYPES_PATH.test(path)
  return typeof message === "string" && ROUTER_TYPES_PATH.test(message)
}

/** Installs the filter once per process; config reloads re-import this module. */
export function surviveRouterTypesRace(): void {
  const installed = Symbol.for("imsweb.router-types-race-guard")
  const registry = globalThis as Record<symbol, unknown>
  if (registry[installed]) return
  registry[installed] = true
  process.on("unhandledRejection", (reason) => {
    if (isRouterTypesRace(reason)) {
      const { code, path } = reason as { code?: string; path?: string }
      console.warn(
        `[vite] React Router type cache race while restarting (${code} ${path ?? ""}); ignored.`
      )
      return
    }
    throw reason
  })
}
