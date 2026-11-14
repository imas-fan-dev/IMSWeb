import { isTauri, type PermissionState } from "@tauri-apps/api/core"
import type { PermissionStatus } from "@tauri-apps/plugin-geolocation"

import { IS_APP_TARGET } from "~/lib/app-target"

const positionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 30_000,
} as const

export type CurrentCoordinates = {
  latitude: number
  longitude: number
}

export type GeolocationFailureKind =
  | "permission-denied"
  | "timeout"
  | "unavailable"
  | "unsupported"

export class GeolocationFailure extends Error {
  readonly kind: GeolocationFailureKind

  constructor(kind: GeolocationFailureKind, cause?: unknown) {
    super(`Geolocation failed: ${kind}`, { cause })
    this.name = "GeolocationFailure"
    this.kind = kind
  }
}

function isPromptable(permission: PermissionState): boolean {
  return permission === "prompt" || permission === "prompt-with-rationale"
}

function hasLocationPermission(permissions: {
  location: PermissionState
  coarseLocation: PermissionState
}): boolean {
  return (
    permissions.location === "granted" ||
    permissions.coarseLocation === "granted"
  )
}

function nativePositionWithDeadline(
  position: Promise<CurrentCoordinates>
): Promise<CurrentCoordinates> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new GeolocationFailure("timeout"))
    }, positionOptions.timeout)

    void position.then(
      (coordinates) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(coordinates)
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        reject(new GeolocationFailure("unavailable", error))
      }
    )
  })
}

async function getNativeCoordinates(): Promise<CurrentCoordinates> {
  let geolocation: typeof import("@tauri-apps/plugin-geolocation")
  let permissions: PermissionStatus

  try {
    geolocation = await import("@tauri-apps/plugin-geolocation")
    permissions = await geolocation.checkPermissions()
    if (
      !hasLocationPermission(permissions) &&
      (isPromptable(permissions.location) ||
        isPromptable(permissions.coarseLocation))
    ) {
      permissions = await geolocation.requestPermissions(["location"])
    }
  } catch (error) {
    throw new GeolocationFailure("unavailable", error)
  }

  if (!hasLocationPermission(permissions)) {
    throw new GeolocationFailure("permission-denied")
  }

  const position = geolocation
    .getCurrentPosition(positionOptions)
    .then(({ coords }) => ({
      latitude: coords.latitude,
      longitude: coords.longitude,
    }))
  return nativePositionWithDeadline(position)
}

function browserFailure(error: GeolocationPositionError): GeolocationFailure {
  if (error.code === 1)
    return new GeolocationFailure("permission-denied", error)
  if (error.code === 3) return new GeolocationFailure("timeout", error)
  return new GeolocationFailure("unavailable", error)
}

function getBrowserCoordinates(): Promise<CurrentCoordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new GeolocationFailure("unsupported"))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        resolve({ latitude: coords.latitude, longitude: coords.longitude })
      },
      (error) => reject(browserFailure(error)),
      positionOptions
    )
  })
}

export function getCurrentCoordinates(): Promise<CurrentCoordinates> {
  if (IS_APP_TARGET && typeof window !== "undefined" && isTauri()) {
    return getNativeCoordinates()
  }
  return getBrowserCoordinates()
}
