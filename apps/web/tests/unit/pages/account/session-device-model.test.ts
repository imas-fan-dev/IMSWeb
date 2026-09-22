import { describe, expect, it } from "vitest"

import { resources } from "~/i18n/resources"
import {
  DEVICE_PLATFORM_KEYS,
  DEVICE_SYSTEM_KEYS,
  parseSessionUserAgent,
  shortSessionDeviceId,
  type SessionDeviceDescriptor,
} from "~/pages/account/security/session-device-model"

const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15"
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"
const LINUX_FIREFOX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0"
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
// WKWebView default UA: no `Version/` and no `Safari/604` segment.
const TAURI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
// Android WebView default UA: `; wv` and `Version/4.0`.
const TAURI_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36"
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 4.4.2; Nexus 7 Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.114 Safari/537.36"
const WINDOWS_PHONE =
  "Mozilla/5.0 (Windows Phone 10.0; Android 4.2.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Edge/15.15063 Mobile Safari/537.36"
const IPOD_TOUCH =
  "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"

// A 1024-character truncation that cuts the string before `Mobile` arrives.
const TRUNCATED_ANDROID = (
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 " +
  "A".repeat(1200) +
  " Mobile Safari/537.36"
).slice(0, 1024)

function expected(
  system: SessionDeviceDescriptor["system"],
  deviceType: SessionDeviceDescriptor["deviceType"],
  platform: SessionDeviceDescriptor["platform"],
  platformVersion: string | null
): SessionDeviceDescriptor {
  return { system, deviceType, platform, platformVersion }
}

const CASES: Array<
  [string, string | null | undefined, SessionDeviceDescriptor]
> = [
  [
    "A1 macOS Chrome",
    MAC_CHROME,
    expected("macos", "desktop", "macintosh", null),
  ],
  [
    "A2 macOS Safari",
    MAC_SAFARI,
    expected("macos", "desktop", "macintosh", null),
  ],
  [
    "A3 Windows Edge",
    WINDOWS_EDGE,
    expected("windows", "desktop", "windows", null),
  ],
  [
    "A4 Linux Firefox",
    LINUX_FIREFOX,
    expected("linux", "desktop", "linux", null),
  ],
  ["B1 iOS Safari", IPHONE_SAFARI, expected("ios", "phone", "iphone", null)],
  [
    "B2 Android Chrome",
    ANDROID_CHROME,
    expected("android", "phone", "android", "14"),
  ],
  ["C1 Tauri iOS", TAURI_IOS, expected("ios", "phone", "iphone", null)],
  [
    "C2 iPadOS desktop mode",
    MAC_SAFARI,
    expected("macos", "desktop", "macintosh", null),
  ],
  [
    "D1 Tauri Android",
    TAURI_ANDROID,
    expected("android", "phone", "android", "14"),
  ],
  ["E1 null", null, expected(null, null, null, null)],
  ["E2 empty", "", expected(null, null, null, null)],
  ["E2b whitespace", "   ", expected(null, null, null, null)],
  [
    "E3 truncated Android",
    TRUNCATED_ANDROID,
    expected("android", "tablet", "android", "14"),
  ],
  ["E4 curl", "curl/8.7.1", expected(null, null, null, null)],
  [
    "E5 Android tablet",
    ANDROID_TABLET,
    expected("android", "tablet", "android", "4.4.2"),
  ],
  [
    "E6 Windows Phone",
    WINDOWS_PHONE,
    expected("windows", "phone", "windows", null),
  ],
  ["E7 iPod touch", IPOD_TOUCH, expected("ios", null, null, null)],
  [
    "E8 Android short",
    "Linux; Android 14",
    expected("android", "tablet", "android", "14"),
  ],
  [
    "E9 Macintosh short",
    "Mozilla/5.0 (Macintosh)",
    expected("macos", "desktop", "macintosh", null),
  ],
  [
    "E10 iPhone short",
    "Mozilla/5.0 (iPhone)",
    expected("ios", "phone", "iphone", null),
  ],
]

describe("parseSessionUserAgent", () => {
  it.each(CASES)("%s", (_name, userAgent, result) => {
    expect(parseSessionUserAgent(userAgent)).toEqual(result)
  })

  it("never throws on malformed or hostile input", () => {
    const inputs = [
      undefined,
      "A".repeat(50_000),
      "(".repeat(2_000),
      MAC_SAFARI + " x86_64 ); ".repeat(500),
    ]
    for (const input of inputs) {
      expect(() => parseSessionUserAgent(input)).not.toThrow()
    }
    expect(parseSessionUserAgent("A".repeat(50_000)).system).toBeNull()
    expect(parseSessionUserAgent("(".repeat(2_000)).system).toBeNull()
  })

  it("keeps Tauri and browser WebView UAs indistinguishable", () => {
    // The clients ship no custom UA, so these pairs cannot be told apart from
    // the stored string. If real-device sampling ever yields a different UA,
    // these equalities are where the calibration work starts.
    expect(parseSessionUserAgent(TAURI_IOS)).toEqual(
      parseSessionUserAgent(IPHONE_SAFARI)
    )
    expect(parseSessionUserAgent(TAURI_ANDROID)).toEqual(
      parseSessionUserAgent(ANDROID_CHROME)
    )
    // iPadOS desktop mode reports the exact desktop Safari UA, so the parser
    // can only ever call it macOS. The ambiguity is recorded, not solved.
    expect(parseSessionUserAgent(MAC_SAFARI)).toEqual(
      expected("macos", "desktop", "macintosh", null)
    )
  })
})

describe("shortSessionDeviceId", () => {
  it("takes the first four characters of a UUID", () => {
    expect(shortSessionDeviceId("3a7f1c2e-9d4b-4c6a-8e2f-1b3c5d7e9f0a")).toBe(
      "3a7f"
    )
    expect(shortSessionDeviceId("9b2d4e6f-1234-4abc-9def-0123456789ab")).toBe(
      "9b2d"
    )
  })

  it("returns the whole id when it is shorter than four characters", () => {
    expect(shortSessionDeviceId("abc")).toBe("abc")
  })

  it("returns an empty string for an empty id", () => {
    expect(shortSessionDeviceId("")).toBe("")
  })

  it("separates two ids that share a prefix boundary", () => {
    // The previous fixtures used `session-current` / `session-other`, which
    // both truncate to `sess`; these ids differ, so the suffix actually has to
    // carry the distinction.
    expect(
      shortSessionDeviceId("3a7f1c2e-9d4b-4c6a-8e2f-1b3c5d7e9f0a")
    ).not.toBe(shortSessionDeviceId("9b2d4e6f-1234-4abc-9def-0123456789ab"))
  })
})

describe("new device-label i18n keys", () => {
  const languages = ["zh-CN", "en"] as const

  it.each(languages)("covers every system key in %s", (language) => {
    const sessions =
      resources[language].common.platformAccount.security.sessions
    for (const key of Object.values(DEVICE_SYSTEM_KEYS)) {
      const leaf = key.split(".").pop() as string
      expect(sessions.deviceSystem).toHaveProperty(leaf)
    }
    expect(sessions.deviceUnknownSystem).toBeTruthy()
    expect(sessions.unknownDevice).toBeTruthy()
    expect(sessions.userAgentLabel).toBeTruthy()
  })

  it.each(languages)("covers every platform key in %s", (language) => {
    const sessions =
      resources[language].common.platformAccount.security.sessions
    for (const key of Object.values(DEVICE_PLATFORM_KEYS)) {
      const leaf = key.split(".").pop() as string
      expect(sessions.devicePlatform).toHaveProperty(leaf)
    }
    expect(sessions.devicePlatform).toHaveProperty("androidVersion")
  })
})
