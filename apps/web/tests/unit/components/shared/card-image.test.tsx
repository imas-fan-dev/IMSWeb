import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  session: { account: { id: "owner" } } as object | null,
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

import { CardImage } from "~/components/shared/card-image"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bearer = true
  mocks.session = { account: { id: "owner" } }
  mocks.create.mockReturnValue("blob:owned")
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: mocks.create,
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: mocks.revoke,
  })
})

describe("CardImage", () => {
  it("renders browser-addressable URLs directly", () => {
    const src = "/api/cards/1/media/front?w=400"
    render(<CardImage src={src} alt="front" />)

    expect(screen.getByAltText("front")).toHaveAttribute("src", src)
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it("fetches owner media and renders the resulting object URL", async () => {
    const send = vi.fn().mockResolvedValue(new Blob(["card"]))
    mocks.load.mockReturnValue({ send, abort: vi.fn() })
    const src =
      "https://api.ims.test/api/community/exchange/me/cards/card-1/media/front?v=3"

    render(<CardImage src={src} alt="owned" />)

    await waitFor(() => {
      expect(screen.getByAltText("owned")).toHaveAttribute("src", "blob:owned")
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(mocks.load).toHaveBeenCalledWith(
      "/api/community/exchange/me/cards/card-1/media/front?v=3",
      expect.objectContaining({ shareRequest: false })
    )
  })
})
