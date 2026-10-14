/**
 * Turns the raw `user_agent` string stored on a platform session into a short,
 * display-safe device descriptor.
 *
 * The stored value is whatever the login request sent, trimmed and truncated to
 * 1024 characters (see the platform session contract). There is no device id,
 * no client type, and no hardware model. Historical rows can hold `null`.
 *
 * Everything here is a pure function over its argument: it never reads
 * `navigator`, `window`, `Date`, or the environment, so it can be asserted
 * directly in the Node test environment and applied to historical rows.
 */

export type DeviceSystem = "ios" | "android" | "macos" | "windows" | "linux"

export type DeviceType = "phone" | "tablet" | "desktop"

/** A platform word that can appear in the main label. */
export type DevicePlatformWord =
  | "iphone"
  | "ipad"
  | "android"
  | "macintosh"
  | "windows"
  | "linux"

export interface SessionDeviceDescriptor {
  /** `null` when no system token was recognized. */
  system: DeviceSystem | null
  /** `null` when the system is known but its form cannot be determined. */
  deviceType: DeviceType | null
  /** Non-null only when both system and deviceType are known and compose. */
  platform: DevicePlatformWord | null
  /** Android major version from the UA's `Android <n>` segment, if present. */
  platformVersion: string | null
}

/**
 * System detection is first-match-wins and the order is load-bearing:
 *
 * 1. Windows Phone embeds `Android 4.2.1`, so it has to be tested before
 *    Android or those devices render as Android.
 * 2. iOS embeds `like Mac OS X`, and iPadOS reports `Macintosh` in desktop
 *    mode, so iOS has to be tested before macOS.
 * 3. Android embeds `Linux`, so Android has to be tested before Linux.
 * 4. `Windows NT 10.0` covers both Windows 10 and 11, which is why the platform
 *    word carries no version.
 */
function detectSystem(userAgent: string): DeviceSystem | null {
  if (/Windows Phone/i.test(userAgent)) return "windows"
  if (
    /\b(iPhone|iPad|iPod)\b/i.test(userAgent) ||
    /CPU (iPhone )?OS \d/i.test(userAgent)
  ) {
    return "ios"
  }
  if (/\bAndroid\b/i.test(userAgent)) return "android"
  if (/\bMacintosh\b/i.test(userAgent)) return "macos"
  if (/Windows NT|Windows \d/i.test(userAgent)) return "windows"
  if (/\bLinux\b/i.test(userAgent) || /\bX11\b/i.test(userAgent)) return "linux"
  return null
}

/**
 * Device type is derived after the system, because the form tokens are not
 * unique to a system: `Mobile` appears in iOS, Android, and Windows Phone UAs.
 */
function detectDeviceType(
  userAgent: string,
  system: DeviceSystem | null
): DeviceType | null {
  switch (system) {
    case "ios":
      if (/\biPad\b/i.test(userAgent)) return "tablet"
      // `iPhone` also appears inside the OS token `CPU iPhone OS <n>`, so the
      // device probe must not read an iPod's OS string as phone hardware.
      if (/\biPhone\b(?! OS)/i.test(userAgent)) return "phone"
      // `iPod`, a bare `CPU OS`, or a truncated string: say less, not wrong.
      return null
    case "android":
      // Android tablets conventionally omit `Mobile`, so a missing token is
      // read as a tablet rather than as unknown. The platform word does not
      // change either way, so a wrong guess only affects the icon.
      return /\bMobile\b/i.test(userAgent) ? "phone" : "tablet"
    case "macos":
    case "linux":
      return "desktop"
    case "windows":
      return /Windows Phone/i.test(userAgent) ? "phone" : "desktop"
    default:
      return null
  }
}

function resolvePlatform(
  system: DeviceSystem | null,
  deviceType: DeviceType | null
): DevicePlatformWord | null {
  switch (system) {
    case "ios":
      if (deviceType === "phone") return "iphone"
      if (deviceType === "tablet") return "ipad"
      return null
    case "android":
      if (deviceType === "phone" || deviceType === "tablet") return "android"
      return null
    case "macos":
      return deviceType === "desktop" ? "macintosh" : null
    case "windows":
      return deviceType === "desktop" || deviceType === "phone"
        ? "windows"
        : null
    case "linux":
      return deviceType === "desktop" ? "linux" : null
    default:
      return null
  }
}

const ANDROID_VERSION_PATTERN = /Android[ /](\d{1,3}(?:\.\d{1,3})*)/i

export function parseSessionUserAgent(
  userAgent: string | null | undefined
): SessionDeviceDescriptor {
  if (typeof userAgent !== "string" || userAgent.trim() === "") {
    return {
      system: null,
      deviceType: null,
      platform: null,
      platformVersion: null,
    }
  }

  const system = detectSystem(userAgent)
  const deviceType = detectDeviceType(userAgent, system)
  const platform = resolvePlatform(system, deviceType)
  const platformVersion =
    system === "android"
      ? (userAgent.match(ANDROID_VERSION_PATTERN)?.[1] ?? null)
      : null

  return { system, deviceType, platform, platformVersion }
}

/**
 * A short, stable suffix that separates two rows sharing a platform word.
 * `id` is the session primary key: certificate rotation during a refresh
 * rewrites the token columns but leaves `id` in place, so the suffix survives
 * a refresh. Four hex characters of a UUID v4 is enough for the handful of
 * sessions a single account can hold, and it exposes nothing beyond the id the
 * revoke control already needs.
 */
export function shortSessionDeviceId(id: string): string {
  if (typeof id !== "string") return ""
  return id.slice(0, 4)
}

/** Punctuation around the short id, not copy, so it stays out of i18n. */
export const DEVICE_LABEL_SEPARATOR = " · "

/** i18n key for each system word, used by the "system known, form unknown" row. */
export const DEVICE_SYSTEM_KEYS = {
  ios: "platformAccount.security.sessions.deviceSystem.ios",
  android: "platformAccount.security.sessions.deviceSystem.android",
  macos: "platformAccount.security.sessions.deviceSystem.macos",
  windows: "platformAccount.security.sessions.deviceSystem.windows",
  linux: "platformAccount.security.sessions.deviceSystem.linux",
} as const satisfies Record<DeviceSystem, string>

/** i18n key for each platform word that can appear in the main label. */
export const DEVICE_PLATFORM_KEYS = {
  iphone: "platformAccount.security.sessions.devicePlatform.iphone",
  ipad: "platformAccount.security.sessions.devicePlatform.ipad",
  android: "platformAccount.security.sessions.devicePlatform.android",
  macintosh: "platformAccount.security.sessions.devicePlatform.macintosh",
  windows: "platformAccount.security.sessions.devicePlatform.windows",
  linux: "platformAccount.security.sessions.devicePlatform.linux",
} as const satisfies Record<DevicePlatformWord, string>
