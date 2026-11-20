import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  session: { account: { id: "collector" } } as object | null,
  bearer: true,
  load: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}))
vi.mock("~/lib/api/origin", () => ({ API_ORIGIN: "https://api.ims.test" }))
vi.mock("~/lib/api/platform-token-store", () => ({
  get usesPlatformBearerAuth() {
    return mocks.bearer
  },
}))
vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: () => ({
    session: mocks.session,
    status: mocks.session ? "authenticated" : "anonymous",
  }),
}))
vi.mock("~/lib/api/platform-client", () => ({
  platformApiClient: { Get: mocks.load },
}))

import { heldCardMediaPath } from "~/lib/api/endpoints/fudaba/held-card-media"
import { useOwnerCardMedia } from "~/components/shared/use-owner-card-media"

const held =
  "/api/community/exchange/cards/card-1/media/page-dcd45349-1d86-4fd4-8c5c-ef4f3d32eeb4?w=400&v=8fe3a70b-d034-4878-950b-dc1aa822dd6c"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bearer = true
  mocks.session = { account: { id: "collector" } }
  mocks.create.mockReturnValue("blob:held")
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: mocks.create,
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: mocks.revoke,
  })
})

describe("held card media credential boundary", () => {
  it("accepts the exchange-wall page routes the collection renders", () => {
    expect(heldCardMediaPath(held, "https://api.ims.test")).toBe(held)
    expect(
      heldCardMediaPath(
        "/api/community/exchange/cards/card-1/media/front?w=400&v=19e1e74d-80f9-4ad8-940a-ced60eb212e6",
        "https://api.ims.test"
      )
    ).toContain("/media/front")
  })
  it.each([
    "https://evil.test/api/community/exchange/cards/card-1/media/front",
    "/api/community/exchange/me/cards/card-1/media/front?v=1",
    "/api/community/exchange/cards/card-1/media/front?token=1",
    "/api/community/exchange/cards/card-1/media/front?v=1&v=2",
    "/api/community/exchange/cards/card-1/media/front?w=999",
    "/api/community/exchange/cards/card-1/media/page-short?v=1",
    "/api/community/exchange/cards/a%2Fb/media/front",
    "blob:local",
  ])("rejects %s", (source) => {
    expect(heldCardMediaPath(source, "https://api.ims.test")).toBeNull()
  })
})

describe("held media authorization", () => {
  it("fetches with the platform client only when the caller marks the card unavailable", async () => {
    mocks.load.mockImplementation(() => ({
      send: () => Promise.resolve(new Blob(["image"])),
      abort: vi.fn(),
    }))
    const hidden = await renderHook(() =>
      useOwnerCardMedia(held, { authorize: true })
    )
    await waitFor(() => expect(hidden.result.current.src).toBe("blob:held"))
    expect(mocks.load).toHaveBeenCalledWith(held, expect.anything())

    mocks.load.mockClear()
    const visible = await renderHook(() => useOwnerCardMedia(held))
    expect(visible.result.current.src).toBe(held)
    expect(mocks.load).not.toHaveBeenCalled()
  })
})
