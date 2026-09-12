import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { isIP } from "node:net"
import { resolve } from "node:path"
import process from "node:process"
import { pathToFileURL, URL } from "node:url"

export const APP_DEV_PORT = 1420

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
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
}

function isLocalDevelopmentHost(hostname) {
  return (
    hostname === "localhost" || hostname === "::1" || isPrivateIpv4(hostname)
  )
}

export function appDevOrigin(environment = process.env) {
  const configured = (environment.IMS_APP_DEV_ORIGIN ?? "").trim()
  if (configured) {
    let parsed
    try {
      parsed = new URL(configured)
    } catch {
      throw new Error("IMS_APP_DEV_ORIGIN must be an absolute local origin")
    }
    if (
      parsed.protocol !== "http:" ||
      !isLocalDevelopmentHost(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        "IMS_APP_DEV_ORIGIN must be an HTTP loopback or private LAN origin"
      )
    }
    return parsed.origin
  }

  const host = (environment.TAURI_DEV_HOST ?? "localhost").trim()
  if (!isLocalDevelopmentHost(host)) {
    throw new Error(
      "TAURI_DEV_HOST must be localhost, loopback, or a private LAN address"
    )
  }
  const formattedHost = isIP(host) === 6 ? `[${host}]` : host
  return `http://${formattedHost}:${APP_DEV_PORT}`
}

export function appDevEnvironment(environment = process.env) {
  const origin = appDevOrigin(environment)
  const localMediaBucket = (
    environment.IMS_RUSTFS_BUCKET ?? "imsweb-media-local"
  )
    .trim()
    .replace(/^\/+|\/+$/g, "")
  const localMediaPort = Number(
    (environment.IMS_RUSTFS_API_PORT ?? "9000").trim()
  )
  if (!localMediaBucket || localMediaBucket.includes("/")) {
    throw new Error("IMS_RUSTFS_BUCKET must be a single path segment")
  }
  if (
    !Number.isInteger(localMediaPort) ||
    localMediaPort < 1 ||
    localMediaPort > 65535
  ) {
    throw new Error("IMS_RUSTFS_API_PORT must be a valid TCP port")
  }

  return {
    ...environment,
    IMS_LOCAL_MEDIA_PROXY_ORIGIN: `http://127.0.0.1:${localMediaPort}`,
    VITE_IMS_APP_TARGET: "app",
    VITE_IMS_LOCAL_MEDIA_PATH_PREFIX: `/${localMediaBucket}`,
    // Tauri's dev URL scheme forwards same-origin requests to this Vite server.
    // Keeping the API relative avoids iOS WebKit's separate LAN fetch path.
    VITE_IMS_API_ORIGIN: "",
    VITE_IMS_PUBLIC_SITE_ORIGIN: origin,
  }
}

export function runAppDev(environment = process.env) {
  const devEnvironment = appDevEnvironment(environment)
  globalThis.console.log(
    `Starting App development at ${devEnvironment.VITE_IMS_PUBLIC_SITE_ORIGIN} ` +
      "with same-origin API and local site-package proxying"
  )

  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  const result = spawnSync(
    command,
    [
      "exec",
      "react-router",
      "dev",
      "--port",
      String(APP_DEV_PORT),
      "--strictPort",
    ],
    {
      cwd: webWorkspaceRoot(),
      env: devEnvironment,
      stdio: "inherit",
    }
  )

  if (result.error) throw result.error
  return result.status ?? 1
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined

if (entryUrl === import.meta.url) {
  process.exitCode = runAppDev()
}
