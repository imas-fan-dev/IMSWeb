import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }))
vi.mock("@tauri-apps/plugin-geolocation", () => ({
  checkPermissions: mocks.checkPermissions,
  requestPermissions: mocks.requestPermissions,
  getCurrentPosition: mocks.getCurrentPosition,
}))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

import { GeolocationFailure, getCurrentCoordinates } from "~/lib/geolocation"

const grantedPermissions = {
  location: "granted",
  coarseLocation: "granted",
} as const

const nativePosition = {
  coords: {
    latitude: 31.230416,
    longitude: 121.473701,
  },
}

function stubBrowserGeolocation(getCurrentPosition: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } })
}

function expectFailureKind(
  promise: Promise<unknown>,
  kind: GeolocationFailure["kind"]
) {
  return expect(promise).rejects.toMatchObject({
    name: "GeolocationFailure",
    kind,
  })
}

describe("getCurrentCoordinates", () => {
  beforeEach(() => {
    vi.useRealTimers()
    mocks.isTauri.mockReset()
    mocks.isTauri.mockReturnValue(true)
    mocks.checkPermissions.mockReset()
    mocks.checkPermissions.mockResolvedValue(grantedPermissions)
    mocks.requestPermissions.mockReset()
    mocks.requestPermissions.mockResolvedValue(grantedPermissions)
    mocks.getCurrentPosition.mockReset()
    mocks.getCurrentPosition.mockResolvedValue(nativePosition)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("uses browser geolocation outside a real Tauri runtime", async () => {
    mocks.isTauri.mockReturnValue(false)
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(nativePosition as GeolocationPosition)
    })
    stubBrowserGeolocation(getCurrentPosition)

    await expect(getCurrentCoordinates()).resolves.toEqual({
      latitude: 31.230416,
      longitude: 121.473701,
    })
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 30_000,
      }
    )
    expect(mocks.checkPermissions).not.toHaveBeenCalled()
  })

  it.each([
    [1, "permission-denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ] as const)("maps browser error code %s to %s", async (code, kind) => {
    mocks.isTauri.mockReturnValue(false)
    stubBrowserGeolocation(
      vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => {
        failure({ code } as GeolocationPositionError)
      })
    )

    await expectFailureKind(getCurrentCoordinates(), kind)
  })

  it("reports unsupported when browser geolocation is absent", async () => {
    mocks.isTauri.mockReturnValue(false)
    vi.stubGlobal("navigator", {})

    await expectFailureKind(getCurrentCoordinates(), "unsupported")
  })

  it("uses native position without requesting an already granted permission", async () => {
    await expect(getCurrentCoordinates()).resolves.toEqual({
      latitude: 31.230416,
      longitude: 121.473701,
    })

    expect(mocks.checkPermissions).toHaveBeenCalledOnce()
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
    expect(mocks.getCurrentPosition).toHaveBeenCalledWith({
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 30_000,
    })
  })

  it("requests location when the native permission can still be prompted", async () => {
    mocks.checkPermissions.mockResolvedValue({
      location: "prompt-with-rationale",
      coarseLocation: "prompt",
    })

    await getCurrentCoordinates()

    expect(mocks.requestPermissions).toHaveBeenCalledWith(["location"])
    expect(mocks.getCurrentPosition).toHaveBeenCalledOnce()
  })

  it("accepts Android coarse location without another permission request", async () => {
    mocks.checkPermissions.mockResolvedValue({
      location: "denied",
      coarseLocation: "granted",
    })

    await expect(getCurrentCoordinates()).resolves.toEqual({
      latitude: 31.230416,
      longitude: 121.473701,
    })
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
    expect(mocks.getCurrentPosition).toHaveBeenCalledOnce()
  })

  it("accepts coarse location returned by the system permission request", async () => {
    mocks.checkPermissions.mockResolvedValue({
      location: "prompt",
      coarseLocation: "prompt",
    })
    mocks.requestPermissions.mockResolvedValue({
      location: "denied",
      coarseLocation: "granted",
    })

    await expect(getCurrentCoordinates()).resolves.toEqual({
      latitude: 31.230416,
      longitude: 121.473701,
    })
    expect(mocks.getCurrentPosition).toHaveBeenCalledOnce()
  })

  it("does not request a position when the permission request is denied", async () => {
    mocks.checkPermissions.mockResolvedValue({
      location: "prompt",
      coarseLocation: "prompt-with-rationale",
    })
    mocks.requestPermissions.mockResolvedValue({
      location: "denied",
      coarseLocation: "denied",
    })

    await expectFailureKind(getCurrentCoordinates(), "permission-denied")
    expect(mocks.requestPermissions).toHaveBeenCalledWith(["location"])
    expect(mocks.getCurrentPosition).not.toHaveBeenCalled()
  })

  it("does not request a position when native location is denied", async () => {
    mocks.checkPermissions.mockResolvedValue({
      location: "denied",
      coarseLocation: "denied",
    })

    await expectFailureKind(getCurrentCoordinates(), "permission-denied")
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
    expect(mocks.getCurrentPosition).not.toHaveBeenCalled()
  })

  it("maps a native permission check failure to unavailable", async () => {
    mocks.checkPermissions.mockRejectedValue(new Error("permission API failed"))

    await expectFailureKind(getCurrentCoordinates(), "unavailable")
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
    expect(mocks.getCurrentPosition).not.toHaveBeenCalled()
  })

  it("enforces a ten-second native deadline", async () => {
    vi.useFakeTimers()
    mocks.getCurrentPosition.mockReturnValue(new Promise(() => undefined))

    const coordinates = getCurrentCoordinates()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getCurrentPosition).toHaveBeenCalledOnce()

    const failure = expectFailureKind(coordinates, "timeout")
    await vi.advanceTimersByTimeAsync(10_000)
    await failure
  })

  it("clears the native deadline after a position resolves", async () => {
    vi.useFakeTimers()

    await expect(getCurrentCoordinates()).resolves.toEqual({
      latitude: 31.230416,
      longitude: 121.473701,
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("maps a native position rejection and clears its deadline", async () => {
    vi.useFakeTimers()
    mocks.getCurrentPosition.mockRejectedValue(new Error("location disabled"))

    await expectFailureKind(getCurrentCoordinates(), "unavailable")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("handles a native rejection after the JavaScript deadline", async () => {
    vi.useFakeTimers()
    let rejectPosition: (error: unknown) => void = () => undefined
    mocks.getCurrentPosition.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectPosition = reject
      })
    )

    const coordinates = getCurrentCoordinates()
    await vi.advanceTimersByTimeAsync(0)
    const failure = expectFailureKind(coordinates, "timeout")
    await vi.advanceTimersByTimeAsync(10_000)
    await failure

    rejectPosition(new Error("late native rejection"))
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
