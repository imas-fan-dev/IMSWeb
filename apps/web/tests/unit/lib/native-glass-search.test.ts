import { describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import {
  nativeGlassSearchEvent,
  nativeGlassSearchTint,
  removeNativeGlassSearch,
  syncNativeGlassSearch,
  type NativeGlassSearchSnapshot,
} from "~/lib/native-glass-search"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

describe("nativeGlassSearchEvent", () => {
  it.each([false, true])(
    "preserves selection metadata and request ownership across IPC, optional fields=%s",
    async (withMetadata) => {
      const snapshot: NativeGlassSearchSnapshot = {
        id: "exchange-search",
        generation: 7,
        revision: 4,
        host: { x: 0, y: 62, width: 402, height: 700 },
        bottomClearance: 80,
        dark: false,
        detent: "collapsed",
        editing: false,
        query: "天府广场",
        busy: false,
        refreshing: true,
        message: "",
        attribution: "OpenStreetMap",
        selected: "已定位：天府广场",
        filterApplied: true,
        pointCount: 2,
        hasAttribution: true,
        results: [
          { id: "place:1", label: "天府广场", address: "成都市 · 青羊区" },
        ],
        labels: { refresh: "刷新名录", clear: "清除地点" },
        ...(withMetadata
          ? { selectedLabel: "天府广场", selectedAddress: "成都市 · 青羊区" }
          : {}),
      }
      vi.mocked(invoke).mockResolvedValueOnce({ supported: true })
      await expect(syncNativeGlassSearch(snapshot)).resolves.toEqual({
        supported: true,
      })
      expect(invoke).toHaveBeenCalledWith("plugin:native-glass|set_search", {
        args: snapshot,
      })
      const { args } = vi.mocked(invoke).mock.calls.at(-1)![1] as {
        args: NativeGlassSearchSnapshot
      }
      expect(args.selectedAddress).toBe(
        withMetadata ? "成都市 · 青羊区" : undefined
      )
      expect(args.refreshing).toBe(true)
      expect(args.results).toBe(snapshot.results)
      vi.mocked(invoke).mockResolvedValueOnce(undefined)
      await removeNativeGlassSearch(snapshot.id, snapshot.generation)
      expect(invoke).toHaveBeenLastCalledWith(
        "plugin:native-glass|remove_search",
        { args: { id: "exchange-search", generation: 7 } }
      )
    }
  )
  it.each([false, true])(
    "keeps dynamic palette colors legible on a dark=%s surface",
    (dark) => {
      for (const rgb of [
        [237, 121, 170],
        [24, 96, 80],
        [255, 194, 11],
      ]) {
        const tint = nativeGlassSearchTint(
          new Uint8ClampedArray([...rgb, 255]),
          dark
        )
        const linear = [tint.red, tint.green, tint.blue].map((channel) =>
          channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4
        )
        const luminance =
          linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
        const contrast = dark
          ? (luminance + 0.05) / 0.05
          : 1.05 / (luminance + 0.05)
        expect(contrast).toBeGreaterThanOrEqual(4.5)
        expect(tint.alpha).toBe(1)
        expect(tint.red > tint.green).toBe(rgb[0]! > rgb[1]!)
        expect(tint.green > tint.blue).toBe(rgb[1]! > rgb[2]!)
      }
    }
  )
  const base = { id: "exchange-search", generation: 2, revision: 3 }
  it("accepts result identities and finite native geometry", () => {
    expect(
      nativeGlassSearchEvent(
        new CustomEvent("search", {
          detail: { ...base, action: "select", value: "place:1" },
        })
      )
    ).toEqual({ ...base, action: "select", value: "place:1" })
    expect(
      nativeGlassSearchEvent(
        new CustomEvent("search", {
          detail: {
            ...base,
            action: "geometry",
            frame: { x: 12, y: 100, width: 300, height: 400 },
          },
        })
      )
    ).not.toBeNull()
  })
  it.each([
    { ...base, action: "select" },
    { ...base, action: "input", value: 1 },
    { ...base, generation: -Infinity, action: "cancel" },
    { ...base, generation: -1, action: "cancel" },
    { ...base, revision: -1, action: "cancel" },
    { ...base, action: "unknown" },
    {
      ...base,
      action: "geometry",
      frame: { x: 0, y: 0, width: -1, height: 20 },
    },
  ])("rejects malformed boundary payload %j", (detail) => {
    expect(
      nativeGlassSearchEvent(new CustomEvent("search", { detail }))
    ).toBeNull()
  })
})
