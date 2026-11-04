import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeFudabaCard,
  makeFudabaOfficeDetail,
  makeFudabaOwnerCard,
  makeFudabaOwnerCardList,
  makeFudabaSeries,
  makeFudabaSeriesList,
} from "@/mocks/data/fudaba"
import {
  makePlatformProfileResponse,
  makePlatformSession,
} from "@/mocks/data/platform"
import { ApiError, type FudabaPublicMessage } from "~/lib/api"
import { cardLabel } from "~/pages/community/exchange/components/card-label"
import CommunityOfficePage from "~/pages/community/exchange/community-office-page"

const apiMocks = vi.hoisted(() => ({
  deleteFudabaCardPlacement: vi.fn(),
  getFudabaWall: vi.fn(),
  getFudabaMixedWall: vi.fn(),
  getFudabaWallScene: vi.fn(),
  getFudabaWallLayout: vi.fn(),
  placeFudabaMessage: vi.fn(),
  getFudabaOwnerCards: vi.fn(),
  getFudabaSeries: vi.fn(),
  getPlatformProfile: vi.fn(),
  saveFudabaCardPlacement: vi.fn(),
  sendOwnerCards: vi.fn(),
  sendOffice: vi.fn(),
  sendPlacement: vi.fn(),
  sendProfile: vi.fn(),
  sendSeries: vi.fn(),
}))

const platformMocks = vi.hoisted(() => ({
  usePlatformSession: vi.fn(),
  useOptionalPlatformSession: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: platformMocks.usePlatformSession,
  useOptionalPlatformSession: platformMocks.useOptionalPlatformSession,
}))

vi.mock("sonner", () => ({ toast: toastMocks }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    deleteFudabaCardPlacement: apiMocks.deleteFudabaCardPlacement,
    getFudabaWall: apiMocks.getFudabaWall,
    getFudabaMixedWall: apiMocks.getFudabaMixedWall,
    getFudabaWallScene: apiMocks.getFudabaWallScene,
    getFudabaWallLayout: apiMocks.getFudabaWallLayout,
    placeFudabaMessage: apiMocks.placeFudabaMessage,

    getFudabaOwnerCards: apiMocks.getFudabaOwnerCards,
    getFudabaSeries: apiMocks.getFudabaSeries,
    getPlatformProfile: apiMocks.getPlatformProfile,
    saveFudabaCardPlacement: apiMocks.saveFudabaCardPlacement,
  }
})

const placedCard = {
  ...makeFudabaCard({ producerName: "交换会用名片" }),
  viewerOwned: true,
  placement: {
    pinnedAt: "2026-08-02T09:00:00.000Z",
    x: 45,
    y: 52,
    rotation: -3,
    zIndex: 2,
    revision: 3,
    updatedAt: "2026-08-02T09:00:00.000Z",
  },
}

const ownerCard = {
  ...makeFudabaOwnerCard(),
  producerName: placedCard.producerName,
}

const unplacedOwnerCard = {
  ...ownerCard,
  id: "card-2",
  producerName: "第二张公开名片",
}

function makeCardLayout(card: typeof placedCard) {
  return {
    kind: "card" as const,
    id: card.id,
    placement: card.placement,
    width: 240,
    height: 160,
    layoutVersion: 1 as const,
    displayName: cardLabel(card),
    viewerOwned: card.viewerOwned,
    preview: null,
    assetVersion: "fixture-front-v1",
  }
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={["/community/exchange/offices/shanghai-weekend"]}
    >
      <Routes>
        <Route
          path="/community/exchange/offices/:officeSlug"
          element={<CommunityOfficePage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

function mockAuthenticatedPlatformSession() {
  const authenticated = {
    status: "authenticated",
    session: makePlatformSession({
      account: { id: "platform-1", status: "active" },
    }),
    error: null,
    acceptSession: vi.fn(),
    reload: vi.fn(),
    logout: vi.fn(),
  }
  platformMocks.usePlatformSession.mockReturnValue(authenticated)
  platformMocks.useOptionalPlatformSession.mockReturnValue(authenticated)
}

describe("CommunityOfficePage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: () => true,
      }))
    )

    vi.clearAllMocks()
    const anonymous = {
      status: "anonymous",
      session: null,
      error: null,
      acceptSession: vi.fn(),
      reload: vi.fn(),
      logout: vi.fn(),
    }
    platformMocks.usePlatformSession.mockReturnValue(anonymous)
    platformMocks.useOptionalPlatformSession.mockReturnValue(anonymous)
    apiMocks.getFudabaMixedWall.mockImplementation(
      (slug: string, input: Record<string, unknown> = {}) => {
        const { item, ...oldInput } = input
        if (typeof item === "string" && item.startsWith("card:"))
          oldInput.card = item.slice(5)
        const method = apiMocks.getFudabaWall(slug, oldInput)
        return {
          ...method,
          send: async () => {
            const result = await method.send()
            return {
              ...result,
              messages: [],
              manageableCardIds: result.office.cards
                .filter((card: { viewerOwned: boolean }) => card.viewerOwned)
                .map((card: { id: string }) => card.id),
              capabilities: {
                canCreateMessage: false,
                canArrangeWall: false,
                canManageMessages: false,
              },
            }
          },
        }
      }
    )
    apiMocks.getFudabaWallScene.mockImplementation((...args: unknown[]) => {
      const method = apiMocks.getFudabaMixedWall(...args)
      return {
        ...method,
        send: async () => {
          const result = await method.send()
          return {
            ...result,
            layouts: result.office.cards.map((card: typeof placedCard) =>
              makeCardLayout(card)
            ),
          }
        },
      }
    })
    apiMocks.getFudabaWallLayout.mockReturnValue({
      abort: () => {},
      send: async () => ({
        items: [makeCardLayout(placedCard)],
        pageInfo: { hasNextPage: false, nextCursor: null },
      }),
    })
    apiMocks.placeFudabaMessage.mockReset()
    apiMocks.getFudabaWall.mockReturnValue({
      abort: vi.fn(),
      send: async () => {
        const office = await apiMocks.sendOffice()
        return {
          office,
          wall: {
            layoutVersion: 1,
            left: 0,
            top: 0,
            right: 1600,
            bottom: 900,
            total: office.cards.length,
            maxZIndex: 2,
          },
          pageInfo: { hasNextPage: false, nextCursor: null },
        }
      },
    })
    apiMocks.getFudabaOwnerCards.mockReturnValue({
      send: apiMocks.sendOwnerCards,
    })
    apiMocks.getFudabaSeries.mockReturnValue({ send: apiMocks.sendSeries })
    apiMocks.getPlatformProfile.mockReturnValue({ send: apiMocks.sendProfile })
    apiMocks.saveFudabaCardPlacement.mockReturnValue({
      send: apiMocks.sendPlacement,
    })
    apiMocks.sendSeries.mockResolvedValue(
      makeFudabaSeriesList({ items: [makeFudabaSeries()] })
    )
    apiMocks.sendOffice.mockResolvedValue(
      makeFudabaOfficeDetail({
        name: "上海周末交换事务所",
        cards: [placedCard],
      })
    )
    apiMocks.sendOwnerCards.mockResolvedValue(
      makeFudabaOwnerCardList({ items: [ownerCard] })
    )
    apiMocks.sendProfile.mockResolvedValue(
      makePlatformProfileResponse({
        account: { id: "platform-1", status: "active" },
      })
    )
    apiMocks.sendPlacement.mockResolvedValue({
      success: true,
      placement: {
        ...placedCard.placement,
        x: 61,
        revision: 4,
        updatedAt: "2026-08-02T10:00:00.000Z",
      },
    })
  })

  it("renders placement view and an accessible card list", async () => {
    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByRole("heading", { name: "上海周末交换事务所" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: `查看${cardLabel(placedCard)}正面`,
      })
    ).toBeVisible()

    await user.click(screen.getByRole("tab", { name: "列表" }))

    expect(
      screen.getByRole("button", {
        name: `查看${cardLabel(placedCard)}正面`,
      })
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: `查看${cardLabel(placedCard)}背面`,
      })
    ).toBeVisible()
  })

  it("automatically completes the observation area without paging controls and reuses its buffer", async () => {
    const cards = Array.from({ length: 60 }, (_, index) => ({
      ...placedCard,
      id: "near-" + index,
      producerName: "区域名片 " + index,
      viewerOwned: false,
      placement: { ...placedCard.placement, x: 800, y: 450 },
    }))
    const farCard = {
      ...cards[0],
      id: "far-card",
      producerName: "远处名片",
      placement: { ...placedCard.placement, x: 3300, y: 450 },
    }
    apiMocks.getFudabaWall.mockImplementation((_slug, input) => ({
      abort: vi.fn(),
      send: async () => {
        const centerX = (input.bbox[0] + input.bbox[2]) / 2
        const near = centerX < 2000
        const office = makeFudabaOfficeDetail({
          cards: near
            ? input.cursor
              ? [...cards.slice(50), cards[49]]
              : cards.slice(0, 50)
            : [farCard],
        })
        return {
          office,
          wall: {
            layoutVersion: 1,
            left: 0,
            top: 0,
            right: 4800,
            bottom: 900,
            total: 61,
            maxZIndex: 61,
          },
          pageInfo: {
            hasNextPage: near && !input.cursor,
            nextCursor: near && !input.cursor ? "region-rest" : null,
          },
        }
      },
    }))
    const { container } = renderPage()
    await waitFor(() =>
      expect(container.querySelectorAll("[data-card-id]")).toHaveLength(60)
    )
    expect(
      screen.queryByRole("button", { name: "下一批名片" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "上一批名片" })
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(apiMocks.getFudabaWall).toHaveBeenCalledWith("shanghai-weekend", {
        // 960 × 540 viewport at 80%, with 25% extra on each side.
        bbox: [-100, -56.25, 1700, 956.25],
        cursor: "region-rest",
      })
    )

    const requests = apiMocks.getFudabaWall.mock.calls.length
    vi.useFakeTimers()
    try {
      const viewport = screen.getByRole("region", { name: "名片墙放置区域" })
      await act(async () => {
        fireEvent.keyDown(viewport, { key: "ArrowRight" })
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(apiMocks.getFudabaWall).toHaveBeenCalledTimes(requests)
      await act(async () => {
        for (let index = 0; index < 24; index++)
          fireEvent.keyDown(viewport, { key: "ArrowRight" })
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(container.querySelectorAll("[data-card-id]")).toHaveLength(1)
      expect(container.querySelector("[data-card-id=far-card]")).not.toBeNull()
      expect(apiMocks.saveFudabaCardPlacement).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps the office usable when the series catalog is unavailable", async () => {
    apiMocks.sendSeries.mockRejectedValue(
      new ApiError("Service Unavailable", {
        kind: "http",
        status: 503,
        payload: { error: "Service Unavailable" },
      })
    )

    renderPage()

    expect(
      await screen.findByRole("heading", { name: "上海周末交换事务所" })
    ).toBeVisible()
    expect(screen.getByText("765")).toBeVisible()
    expect(screen.queryByText("事务所暂时无法加载")).not.toBeInTheDocument()
  })

  it("distinguishes a missing office from the disabled feature", async () => {
    apiMocks.sendOffice.mockRejectedValue(
      new ApiError("Fudaba office not found", {
        kind: "http",
        status: 404,
        payload: { error: "Fudaba office not found" },
      })
    )

    renderPage()

    expect(await screen.findByText("未找到这个事务所")).toBeVisible()
    expect(screen.queryByText("社区交换区尚未开放")).not.toBeInTheDocument()
  })

  it("shows the closed state when the feature route is disabled", async () => {
    apiMocks.sendOffice.mockRejectedValue(
      new ApiError("Not Found", {
        kind: "http",
        status: 404,
        payload: "Not Found",
      })
    )

    renderPage()

    expect(await screen.findByText("社区交换区尚未开放")).toBeVisible()
    expect(screen.queryByText("未找到这个事务所")).not.toBeInTheDocument()
  })

  it("selects the wall, enters editing on the card click, and opens the next click", async () => {
    const user = userEvent.setup()
    mockAuthenticatedPlatformSession()
    renderPage()
    await screen.findByRole("button", { name: "布置名片墙" })
    const card = screen.getByRole("button", {
      name: `查看${cardLabel(placedCard)}正面`,
    })
    await user.click(card)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "完成布置" })).toBeVisible()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(card.closest("[data-card-id]")).toHaveClass("ring-2")
    expect(card.querySelector("img")).toHaveAttribute("draggable", "false")
    await user.click(card)
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(apiMocks.saveFudabaCardPlacement).not.toHaveBeenCalled()
  })

  it("links to namecard management when owner cards cannot load", async () => {
    mockAuthenticatedPlatformSession()
    apiMocks.sendOwnerCards.mockRejectedValue(
      new Error("Owner cards unavailable")
    )

    renderPage()

    expect(
      await screen.findByRole("link", { name: "管理我的名片" })
    ).toHaveAttribute("href", "/account/me/namecards")
  })

  it("links to namecard creation when the owner has no public cards", async () => {
    mockAuthenticatedPlatformSession()
    apiMocks.sendOwnerCards.mockResolvedValue(
      makeFudabaOwnerCardList({ items: [] })
    )
    apiMocks.sendOffice.mockResolvedValue(
      makeFudabaOfficeDetail({
        name: "上海周末交换事务所",
        cards: [],
      })
    )

    renderPage()

    expect(
      await screen.findByRole("link", { name: "创建可公开名片" })
    ).toHaveAttribute("href", "/account/me/namecards")
  })

  it("keeps a saved message placement when an older scene finishes loading", async () => {
    const user = userEvent.setup()
    mockAuthenticatedPlatformSession()
    const note: FudabaPublicMessage = {
      id: "note-1",
      office: {
        id: "office-1",
        slug: "shanghai-weekend",
        name: "上海周末交换事务所",
        isOpen: true,
      },
      authorName: "留言作者",
      content: "移动回归留言",
      color: "cream",
      createdAt: "2026-08-02T09:00:00.000Z",
      updatedAt: "2026-08-02T09:00:00.000Z",
      placement: {
        ...placedCard.placement,
        x: 800,
        y: 450,
        rotation: 0,
      },
      capabilities: {
        canEdit: true,
        canMove: true,
        canDestroy: true,
      },
    }
    const layout = {
      kind: "message" as const,
      id: note.id,
      placement: note.placement,
      width: 242,
      height: 277,
      layoutVersion: 1 as const,
      color: note.color,
      contentRevision: 0,
    }
    const initial = await apiMocks.getFudabaMixedWall("shanghai-weekend").send()
    const scene = {
      ...initial,
      wall: { ...initial.wall, total: 2 },
      messages: [note],
      layouts: [makeCardLayout(placedCard), layout],
    }
    const sendScene = vi.fn().mockResolvedValue(scene)
    apiMocks.getFudabaWallScene.mockImplementation(() => ({
      abort: vi.fn(),
      send: sendScene,
    }))
    apiMocks.getFudabaWallLayout.mockReturnValue({
      abort: vi.fn(),
      send: async () => ({
        items: scene.layouts,
        pageInfo: { hasNextPage: false, nextCursor: null },
      }),
    })
    apiMocks.placeFudabaMessage.mockImplementation(
      (
        _id: string,
        input: {
          x: number
          y: number
          rotation: number
          zIndex: number
          expectedRevision: number
        }
      ) => ({
        send: async () => ({
          success: true,
          message: {
            ...note,
            office: { ...note.office, status: "active" },
            authorAccountId: "platform-1",
            contentRevision: 0,
            moderationRevision: 0,
            hiddenByOffice: false,
            hiddenByAdmin: false,
            placement: {
              ...note.placement,
              x: input.x,
              y: input.y,
              rotation: input.rotation,
              zIndex: input.zIndex,
              revision: input.expectedRevision + 1,
            },
            capabilities: {
              ...note.capabilities,
              canModerateOffice: false,
              canModerateAdmin: false,
            },
          },
        }),
      })
    )

    const { container } = renderPage()
    await user.click(
      await screen.findByRole("button", { name: "留言：留言作者" })
    )
    const handle = await screen.findByRole("button", { name: "移动留言" })
    const refresh = screen.getByRole("button", { name: "刷新墙面" })
    await waitFor(() => expect(refresh).toBeEnabled())

    let releaseOldScene: (value: typeof scene) => void = () => {
      throw new Error("The pending scene has not been created")
    }
    const oldScene = new Promise<typeof scene>((resolve) => {
      releaseOldScene = resolve
    })
    const callsBeforeRefresh = sendScene.mock.calls.length
    sendScene.mockImplementationOnce(() => oldScene)
    await user.click(refresh)
    await waitFor(() =>
      expect(sendScene).toHaveBeenCalledTimes(callsBeforeRefresh + 1)
    )

    handle.focus()
    await user.keyboard("{ArrowRight}")
    const paper = () => container.querySelector('[data-message-id="note-1"]')
    await waitFor(() =>
      expect(paper()).toHaveAttribute("data-placement-x", "816")
    )
    await waitFor(() =>
      expect(apiMocks.placeFudabaMessage).toHaveBeenCalledTimes(1)
    )

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "移动留言" })).toBeEnabled()
    )
    await act(async () => {
      releaseOldScene(scene)
      await oldScene
    })
    expect(paper()).toHaveAttribute("data-placement-x", "816")

    screen.getByRole("button", { name: "移动留言" }).focus()
    await user.keyboard("{ArrowRight}")
    await waitFor(() =>
      expect(apiMocks.placeFudabaMessage).toHaveBeenNthCalledWith(2, "note-1", {
        layoutVersion: 1,
        x: 832,
        y: 450,
        rotation: 0,
        zIndex: note.placement.zIndex,
        expectedRevision: note.placement.revision + 1,
      })
    )
  })

  it("saves keyboard placement changes for the signed-in card owner", async () => {
    const user = userEvent.setup()
    mockAuthenticatedPlatformSession()

    renderPage()
    await user.click(await screen.findByRole("button", { name: "布置名片墙" }))
    expect(screen.getByRole("link", { name: "管理名片" })).toHaveAttribute(
      "href",
      "/account/me/namecards"
    )
    const handle = await screen.findByRole("button", {
      name: `移动${cardLabel(placedCard)}`,
    })
    handle.focus()
    await user.keyboard("{ArrowRight}")

    await waitFor(() => {
      expect(apiMocks.saveFudabaCardPlacement).toHaveBeenCalledWith(
        "office-1",
        "card-1",
        {
          layoutVersion: 1,
          x: 61,
          y: 52,
          rotation: -3,
          zIndex: 2,
          expectedRevision: 3,
        }
      )
    })
  })

  it("adds a newly placed card to the locator without losing existing cards", async () => {
    const user = userEvent.setup()
    mockAuthenticatedPlatformSession()
    apiMocks.sendOwnerCards.mockResolvedValue(
      makeFudabaOwnerCardList({ items: [ownerCard, unplacedOwnerCard] })
    )
    const newCard = {
      ...placedCard,
      id: unplacedOwnerCard.id,
      producerName: unplacedOwnerCard.producerName,
      placement: { ...placedCard.placement, revision: 0, zIndex: 3 },
    }
    apiMocks.sendPlacement.mockResolvedValueOnce({
      success: true,
      placement: newCard.placement,
    })
    renderPage()
    const editButton = await screen.findByRole("button", { name: "布置名片墙" })
    const locateButton = screen.getByRole("button", {
      name: "定位我的名片",
    })
    await waitFor(() => expect(locateButton).toBeEnabled())
    const getWall = apiMocks.getFudabaWall.getMockImplementation()!
    apiMocks.getFudabaWall.mockImplementation(
      (slug, input: { card?: string } = {}) => {
        const method = getWall(slug, input)
        return input.card === newCard.id
          ? method
          : { ...method, send: () => new Promise<never>(() => undefined) }
      }
    )
    apiMocks.sendOffice.mockResolvedValueOnce(
      makeFudabaOfficeDetail({ cards: [newCard] })
    )
    apiMocks.sendOffice.mockResolvedValue(
      makeFudabaOfficeDetail({ cards: [placedCard, newCard] })
    )

    await user.click(editButton)
    await user.click(screen.getByRole("button", { name: "放到墙上" }))
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalled())
    await user.click(locateButton)
    const choices = screen.getByLabelText("选择要定位的名片")
    expect(
      within(choices).getByRole("button", { name: /第二张公开名片/ })
    ).toBeInTheDocument()
    expect(
      within(choices).getByRole("button", { name: /交换会用名片/ })
    ).toBeInTheDocument()
  })

  it("removes a withdrawn card from the locator and wall placeholders", async () => {
    const user = userEvent.setup()
    mockAuthenticatedPlatformSession()
    apiMocks.deleteFudabaCardPlacement.mockReturnValue({
      send: vi.fn().mockResolvedValue({ success: true }),
    })
    const { container } = renderPage()
    const editButton = await screen.findByRole("button", { name: "布置名片墙" })
    const locateButton = screen.getByRole("button", {
      name: "定位我的名片",
    })
    await waitFor(() => expect(locateButton).toBeEnabled())
    apiMocks.sendOffice.mockResolvedValue(makeFudabaOfficeDetail({ cards: [] }))

    await user.click(editButton)
    await user.click(screen.getByRole("button", { name: "从名片墙移除" }))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "移除",
      })
    )
    await waitFor(() =>
      expect(apiMocks.deleteFudabaCardPlacement).toHaveBeenCalled()
    )
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith("名片已从墙上移除。")
    )
    await user.click(locateButton)
    const choices = screen.getByLabelText("选择要定位的名片")
    expect(
      within(choices).queryByRole("button", { name: /交换会用名片/ })
    ).not.toBeInTheDocument()
    expect(
      within(choices).getByText("当前墙上还没有我的名片。")
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-wall-placeholder="card:card-1"]')
    ).toBeNull()
    expect(container.querySelector('[data-card-id="card-1"]')).toBeNull()
  })

  it("keeps a successful placement out of the retry path when refresh fails", async () => {
    const user = userEvent.setup()
    mockAuthenticatedPlatformSession()
    apiMocks.sendOwnerCards.mockResolvedValue(
      makeFudabaOwnerCardList({ items: [ownerCard, unplacedOwnerCard] })
    )
    apiMocks.sendPlacement.mockResolvedValueOnce({
      success: true,
      placement: {
        pinnedAt: "2026-08-02T10:00:00.000Z",
        x: 50,
        y: 50,
        rotation: 0,
        zIndex: 3,
        revision: 0,
        updatedAt: "2026-08-02T10:00:00.000Z",
      },
    })

    renderPage()
    const editButton = await screen.findByRole("button", {
      name: "布置名片墙",
    })
    apiMocks.sendOffice.mockRejectedValueOnce(
      new ApiError("Service Unavailable", {
        kind: "http",
        status: 503,
        payload: { error: "Service Unavailable" },
      })
    )

    await user.click(editButton)
    const addButton = screen.getByRole("button", { name: "放到墙上" })
    await user.click(addButton)

    await waitFor(() => {
      expect(apiMocks.sendOffice).toHaveBeenCalledTimes(2)
      expect(addButton).toBeDisabled()
    })
    expect(apiMocks.saveFudabaCardPlacement).toHaveBeenCalledOnce()
    expect(apiMocks.saveFudabaCardPlacement).toHaveBeenCalledWith(
      "office-1",
      "card-2",
      {
        layoutVersion: 1,
        // Entering edit mode no longer re-centers the camera, so the new card
        // lands at the default viewport center.
        x: 800,
        y: 450,
        rotation: 0,
        zIndex: 3,
        expectedRevision: null,
      }
    )
    expect(toastMocks.warning).toHaveBeenCalledWith(
      "名片已放到墙上，但最新墙面暂时无法重新载入。"
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(toastMocks.error).not.toHaveBeenCalled()

    await user.click(addButton)
    expect(apiMocks.saveFudabaCardPlacement).toHaveBeenCalledOnce()
  })

  it("asks for a manual reload when conflict recovery cannot refresh", async () => {
    const user = userEvent.setup()
    mockAuthenticatedPlatformSession()

    renderPage()
    const editButton = await screen.findByRole("button", {
      name: "布置名片墙",
    })
    apiMocks.sendPlacement.mockRejectedValueOnce(
      new ApiError("Placement conflict", {
        kind: "http",
        status: 409,
        code: "FUDABA_CARD_PLACEMENT_CONFLICT",
        payload: { revision: 4 },
      })
    )
    apiMocks.sendOffice.mockRejectedValueOnce(
      new ApiError("Service Unavailable", {
        kind: "http",
        status: 503,
        payload: { error: "Service Unavailable" },
      })
    )

    await user.click(editButton)
    const handle = screen.getByRole("button", {
      name: `移动${cardLabel(placedCard)}`,
    })
    handle.focus()
    await user.keyboard("{ArrowRight}")

    await waitFor(() => {
      expect(apiMocks.sendOffice).toHaveBeenCalledTimes(2)
      expect(toastMocks.error).toHaveBeenCalledWith(
        "名片墙已在其他页面更新，但最新布局暂时无法载入，请重新加载页面。"
      )
    })
    expect(toastMocks.error).not.toHaveBeenCalledWith(
      "名片墙已在其他页面更新，当前布局已重新载入。"
    )
  })
})
