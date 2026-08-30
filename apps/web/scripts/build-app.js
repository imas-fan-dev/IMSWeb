import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"
import { pathToFileURL, URL } from "node:url"

export const DEFAULT_APP_ORIGIN = "https://idol-master.top"

function webWorkspaceRoot() {
  const currentDirectory = process.cwd()
  const candidates = [
    currentDirectory,
    resolve(currentDirectory, "apps/web"),
    resolve(currentDirectory, ".."),
  ]
  const workspace = candidates.find((candidate) =>
    existsSync(resolve(candidate, "react-router.config.ts"))
  )
  if (!workspace) throw new Error("Cannot locate the @imsweb/web workspace")
  return workspace
}

const LOCAL_BUILD_HOSTS = new Set(["127.0.0.1", "::1", "localhost"])

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
}

export function normalizeAppBuildOrigin(name, value, allowInsecureLan = false) {
  const candidate = (value ?? "").trim() || DEFAULT_APP_ORIGIN
  let parsed

  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) origin`)
  }

  const localHttp =
    parsed.protocol === "http:" &&
    (LOCAL_BUILD_HOSTS.has(parsed.hostname) ||
      (allowInsecureLan && isPrivateIpv4(parsed.hostname)))
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error(
      `${name} must use HTTPS outside loopback development. ` +
        "Set IMS_ALLOW_INSECURE_LAN_APP_ORIGIN=1 only for a private LAN API."
    )
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must be an origin without credentials or a path`)
  }

  return parsed.origin
}

function optionalAppBuildOrigin(name, value, allowInsecureLan) {
  return (value ?? "").trim()
    ? normalizeAppBuildOrigin(name, value, allowInsecureLan)
    : ""
}

export function appBuildEnvironment(environment = process.env) {
  const packagedEnvironment = { ...environment }
  const allowInsecureLan = environment.IMS_ALLOW_INSECURE_LAN_APP_ORIGIN === "1"
  delete packagedEnvironment.VITE_IMS_LOCAL_MEDIA_PATH_PREFIX
  delete packagedEnvironment.IMS_LOCAL_MEDIA_PROXY_ORIGIN

  return {
    ...packagedEnvironment,
    VITE_IMS_APP_TARGET: "app",
    VITE_IMS_API_ORIGIN: normalizeAppBuildOrigin(
      "VITE_IMS_API_ORIGIN",
      environment.VITE_IMS_API_ORIGIN,
      allowInsecureLan
    ),
    VITE_IMS_PUBLIC_SITE_ORIGIN: normalizeAppBuildOrigin(
      "VITE_IMS_PUBLIC_SITE_ORIGIN",
      environment.VITE_IMS_PUBLIC_SITE_ORIGIN,
      allowInsecureLan
    ),
    VITE_IMS_MAP_TRANSPORT_ORIGIN: optionalAppBuildOrigin(
      "VITE_IMS_MAP_TRANSPORT_ORIGIN",
      environment.VITE_IMS_MAP_TRANSPORT_ORIGIN,
      allowInsecureLan
    ),
  }
}

export function runAppBuild(environment = process.env) {
  const buildEnvironment = appBuildEnvironment(environment)
  globalThis.console.log(
    `Building App target with API ${buildEnvironment.VITE_IMS_API_ORIGIN} ` +
      `and public site ${buildEnvironment.VITE_IMS_PUBLIC_SITE_ORIGIN}`
  )

  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  const result = spawnSync(command, ["exec", "react-router", "build"], {
    cwd: webWorkspaceRoot(),
    env: buildEnvironment,
    stdio: "inherit",
  })

  if (result.error) throw result.error
  return result.status ?? 1
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined

if (entryUrl === import.meta.url) {
  process.exitCode = runAppBuild()
}
