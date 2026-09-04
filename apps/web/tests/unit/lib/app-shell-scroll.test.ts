import { beforeEach, describe, expect, it } from "vitest"

import {
  appTabScrollPosition,
  rememberAppTabScrollPosition,
} from "~/lib/app-shell-scroll"

describe("App tab scroll memory", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("stores an independent non-negative position for each tab", () => {
    rememberAppTabScrollPosition("home", 420)
    rememberAppTabScrollPosition("events", 180)
    rememberAppTabScrollPosition("apps", -12)

    expect(appTabScrollPosition("home")).toBe(420)
    expect(appTabScrollPosition("events")).toBe(180)
    expect(appTabScrollPosition("apps")).toBe(0)
  })

  it("ignores malformed or non-finite stored values", () => {
    window.sessionStorage.setItem("ims:app-tab-scroll", "not-json")
    expect(appTabScrollPosition("home")).toBeNull()

    rememberAppTabScrollPosition("home", Number.NaN)
    expect(appTabScrollPosition("home")).toBeNull()
  })
})
