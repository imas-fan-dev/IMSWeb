import { describe, expect, it } from "vitest"

import {
  NATIVE_BACK_EVENT,
  nativeBackGesture,
  type NativeBackGesture,
} from "~/lib/native-back"

function event(detail: unknown) {
  return new CustomEvent(NATIVE_BACK_EVENT, { detail })
}

function gesture(overrides: Partial<NativeBackGesture> = {}): NativeBackGesture {
  return {
    generation: 7,
    revision: 3,
    gestureId: 1,
    phase: "commit",
    progress: 1,
    ...overrides,
  }
}

describe("native back gesture decoding", () => {
  it("accepts a bounded gesture from the current bridge", () => {
    expect(nativeBackGesture(event(gesture()))).toEqual(gesture())
    expect(
      nativeBackGesture(event(gesture({ phase: "progress", progress: 0.42 })))
    ).toEqual(gesture({ phase: "progress", progress: 0.42 }))
  })

  it("rejects events that are not CustomEvents or lack a bridge payload", () => {
    expect(nativeBackGesture(new Event(NATIVE_BACK_EVENT))).toBeNull()
    expect(nativeBackGesture(event(null))).toBeNull()
    expect(nativeBackGesture(event("commit"))).toBeNull()
    expect(nativeBackGesture(event({}))).toBeNull()
  })

  it("rejects unknown phases, unsafe versions and out-of-range progress", () => {
    expect(nativeBackGesture(event(gesture({ phase: "end" as never })))).toBeNull()
    expect(nativeBackGesture(event(gesture({ generation: -1 })))).toBeNull()
    expect(nativeBackGesture(event(gesture({ revision: 1.5 })))).toBeNull()
    expect(nativeBackGesture(event(gesture({ gestureId: 0 })))).toBeNull()
    expect(nativeBackGesture(event(gesture({ progress: 1.5 })))).toBeNull()
    expect(nativeBackGesture(event(gesture({ progress: Number.NaN })))).toBeNull()
  })
})
