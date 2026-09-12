import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  androidReleaseAllowsCleartext,
  configureGeneratedAndroidCleartext,
} from "../../../scripts/android-release-network.js"
import {
  DEFAULT_APP_ORIGIN,
  appBuildEnvironment,
  normalizeAppBuildOrigin,
} from "../../../scripts/build-app.js"
import {
  APP_DEV_PORT,
  appDevEnvironment,
  appDevOrigin,
} from "../../../scripts/dev-app.js"

describe("App build environment", () => {
  it("uses the public production origin when no override is provided", () => {
    const environment = appBuildEnvironment({})

    expect(environment).toMatchObject({
      VITE_IMS_APP_TARGET: "app",
      VITE_IMS_API_ORIGIN: DEFAULT_APP_ORIGIN,
      VITE_IMS_PUBLIC_SITE_ORIGIN: DEFAULT_APP_ORIGIN,
      VITE_IMS_MAP_TRANSPORT_ORIGIN: "",
    })
  })

  it("drops development-only object-storage proxy variables", () => {
    const environment = appBuildEnvironment({
      VITE_IMS_LOCAL_MEDIA_PATH_PREFIX: "/__ims-local-media",
      IMS_LOCAL_MEDIA_PROXY_ORIGIN: "http://127.0.0.1:9000",
      VITE_IMS_API_ORIGIN: "http://127.0.0.1:3000/",
      VITE_IMS_PUBLIC_SITE_ORIGIN: "http://localhost:1420/",
      VITE_IMS_MAP_TRANSPORT_ORIGIN: "http://localhost:1420/",
      TAURI_DEV_HOST: "127.0.0.1",
      CUSTOM_DEVELOPMENT_SETTING: "preserved",
    })

    expect(environment).toMatchObject({
      VITE_IMS_APP_TARGET: "app",
      VITE_IMS_API_ORIGIN: "http://127.0.0.1:3000",
      VITE_IMS_PUBLIC_SITE_ORIGIN: "http://localhost:1420",
      VITE_IMS_MAP_TRANSPORT_ORIGIN: "http://localhost:1420",
      TAURI_DEV_HOST: "127.0.0.1",
      CUSTOM_DEVELOPMENT_SETTING: "preserved",
    })
    expect(environment).not.toHaveProperty("VITE_IMS_LOCAL_MEDIA_PATH_PREFIX")
    expect(environment).not.toHaveProperty("IMS_LOCAL_MEDIA_PROXY_ORIGIN")
  })

  it("normalizes explicit production and loopback origins", () => {
    expect(
      normalizeAppBuildOrigin(
        "VITE_IMS_API_ORIGIN",
        "https://api.idol-master.top/"
      )
    ).toBe("https://api.idol-master.top")
    expect(
      normalizeAppBuildOrigin("VITE_IMS_API_ORIGIN", "http://127.0.0.1:3000")
    ).toBe("http://127.0.0.1:3000")
  })

  it("permits an explicitly opted-in private LAN API origin", () => {
    const environment = appBuildEnvironment({
      IMS_ALLOW_INSECURE_LAN_APP_ORIGIN: "1",
      VITE_IMS_API_ORIGIN: "http://192.168.31.169:3000/",
      VITE_IMS_MAP_TRANSPORT_ORIGIN: "http://192.168.31.169:1420/",
    })

    expect(environment.VITE_IMS_API_ORIGIN).toBe("http://192.168.31.169:3000")
    expect(environment.VITE_IMS_MAP_TRANSPORT_ORIGIN).toBe(
      "http://192.168.31.169:1420"
    )
  })

  it.each([
    "http://idol-master.top",
    "https://user:pass@idol-master.top",
    "https://idol-master.top/api",
    "https://idol-master.top?source=app",
    "not-a-url",
  ])("rejects an unsafe build origin: %s", (origin) => {
    expect(() =>
      normalizeAppBuildOrigin("VITE_IMS_API_ORIGIN", origin, true)
    ).toThrow()
  })

  it("keeps a private LAN HTTP origin opt-in only", () => {
    expect(() =>
      appBuildEnvironment({
        VITE_IMS_API_ORIGIN: "http://192.168.31.169:3000",
      })
    ).toThrow()
  })

  it("enables Android Release cleartext only for an opted-in LAN build", () => {
    const allowsCleartext = (environment: NodeJS.ProcessEnv) =>
      androidReleaseAllowsCleartext(
        environment,
        appBuildEnvironment(environment)
      )

    expect(
      allowsCleartext({
        IMS_ALLOW_INSECURE_LAN_APP_ORIGIN: "1",
        VITE_IMS_API_ORIGIN: "http://10.0.2.2:3001",
        VITE_IMS_PUBLIC_SITE_ORIGIN: "http://10.0.2.2:1420",
      })
    ).toBe(true)
    expect(
      allowsCleartext({
        VITE_IMS_API_ORIGIN: "http://127.0.0.1:3000",
      })
    ).toBe(false)
    expect(
      allowsCleartext({
        IMS_ALLOW_INSECURE_LAN_APP_ORIGIN: "1",
        VITE_IMS_API_ORIGIN: "https://api.idol-master.top",
      })
    ).toBe(false)
  })

  it("patches only the Android Release cleartext placeholder", () => {
    const directory = mkdtempSync(join(tmpdir(), "imsweb-android-gradle-"))
    const gradlePath = join(directory, "build.gradle.kts")
    const source = `defaultConfig {
  manifestPlaceholders["usesCleartextTraffic"] = "false"
}
buildTypes {
  getByName("debug") {
    manifestPlaceholders["usesCleartextTraffic"] = "true"
  }
}
`
    writeFileSync(gradlePath, source)

    try {
      expect(
        configureGeneratedAndroidCleartext({
          environment: {
            IMS_ALLOW_INSECURE_LAN_APP_ORIGIN: "1",
            VITE_IMS_API_ORIGIN: "http://10.0.2.2:3001",
          },
          buildEnvironment: {
            VITE_IMS_API_ORIGIN: "http://10.0.2.2:3001",
            VITE_IMS_PUBLIC_SITE_ORIGIN: "https://idol-master.top",
            VITE_IMS_MAP_TRANSPORT_ORIGIN: "",
          },
          gradlePath,
        })
      ).toBe(true)
      expect(readFileSync(gradlePath, "utf8")).toContain(
        'defaultConfig {\n  manifestPlaceholders["usesCleartextTraffic"] = "true"'
      )
      expect(
        readFileSync(gradlePath, "utf8").match(
          /manifestPlaceholders\["usesCleartextTraffic"\] = "true"/g
        )
      ).toHaveLength(2)

      expect(
        configureGeneratedAndroidCleartext({
          environment: {},
          buildEnvironment: {
            VITE_IMS_API_ORIGIN: "https://idol-master.top",
            VITE_IMS_PUBLIC_SITE_ORIGIN: "https://idol-master.top",
            VITE_IMS_MAP_TRANSPORT_ORIGIN: "",
          },
          gradlePath,
        })
      ).toBe(false)
      expect(readFileSync(gradlePath, "utf8")).toContain(
        'defaultConfig {\n  manifestPlaceholders["usesCleartextTraffic"] = "false"'
      )
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })
})

describe("App development environment", () => {
  it("keeps API requests on the Tauri dev origin", () => {
    const environment = appDevEnvironment({
      TAURI_DEV_HOST: "192.168.31.169",
      VITE_IMS_API_ORIGIN: "https://idol-master.top",
    })

    expect(environment).toMatchObject({
      VITE_IMS_APP_TARGET: "app",
      VITE_IMS_API_ORIGIN: "",
      VITE_IMS_PUBLIC_SITE_ORIGIN: `http://192.168.31.169:${APP_DEV_PORT}`,
    })
  })

  it("uses localhost for desktop Tauri development", () => {
    expect(appDevOrigin({})).toBe(`http://localhost:${APP_DEV_PORT}`)
  })

  it("supports an explicit private LAN development origin", () => {
    expect(appDevOrigin({ IMS_APP_DEV_ORIGIN: "http://10.0.0.8:5180" })).toBe(
      "http://10.0.0.8:5180"
    )
  })

  it.each([
    { TAURI_DEV_HOST: "0.0.0.0" },
    { TAURI_DEV_HOST: "example.com" },
    { IMS_APP_DEV_ORIGIN: "https://idol-master.top" },
    { IMS_APP_DEV_ORIGIN: "http://192.168.31.169:1420/path" },
  ])("rejects a non-local App development origin: %o", (environment) => {
    expect(() => appDevOrigin(environment)).toThrow()
  })
})
