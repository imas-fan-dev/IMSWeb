import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/lib/api"
import { useOwnerCardMedia } from "~/components/shared/use-owner-card-media"

const mediaMocks = vi.hoisted(() => ({
  getOwnerCardMedia: vi.fn(),
  getHeldCardMedia: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/api")>()),
  getOwnerCardMedia: mediaMocks.getOwnerCardMedia,
  getHeldCardMedia: mediaMocks.getHeldCardMedia,
  ownerCardMediaRequiresAuth: () => true,
  heldCardMediaRequiresAuth: () => false,
}))

vi.mock("~/components/platform/platform-session-provider", () => {
  // 会话对象必须保持同一引用：真实 Provider 用 useMemo 稳定它，测试也照做，
  // 否则每次 render 都换 session，effect 会无限 abort/重取。
  const session = { account: { id: "acct-1" } }
  return {
    useOptionalPlatformSession: () => ({
      status: "authenticated",
      session,
      error: null,
    }),
  }
})

function Probe({ source }: { source: string }) {
  const media = useOwnerCardMedia(source)
  return (
    <>
      <span data-testid="src">{media.src ?? "none"}</span>
      <span data-testid="failed">{media.failed ? "yes" : "no"}</span>
    </>
  )
}

const SOURCE =
  "/api/community/exchange/me/cards/card-1/media/page-aaaaaaaa?w=800&v=1"

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:card-1"),
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useOwnerCardMedia", () => {
  it("retries a transient abort instead of latching the failure", async () => {
    let calls = 0
    mediaMocks.getOwnerCardMedia.mockImplementation(() => ({
      send: () =>
        ++calls === 1
          ? Promise.reject(new ApiError("请求已取消", { kind: "aborted" }))
          : Promise.resolve(new Blob(["webp"], { type: "image/webp" })),
      abort: vi.fn(),
    }))

    render(<Probe source={SOURCE} />)
    expect(screen.getByTestId("src")).toHaveTextContent("none")

    await vi.waitFor(
      () => expect(screen.getByTestId("src")).toHaveTextContent("blob:card-1"),
      { timeout: 2000 }
    )

    expect(mediaMocks.getOwnerCardMedia).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId("failed")).toHaveTextContent("no")
  })

  it("shows a real 404 as failed without retrying", async () => {
    mediaMocks.getOwnerCardMedia.mockReturnValue({
      send: () =>
        Promise.reject(new ApiError("Not Found", { kind: "http", status: 404 })),
      abort: vi.fn(),
    })

    render(<Probe source={SOURCE} />)

    await vi.waitFor(() =>
      expect(screen.getByTestId("failed")).toHaveTextContent("yes")
    )
    expect(mediaMocks.getOwnerCardMedia).toHaveBeenCalledTimes(1)
  })
})
