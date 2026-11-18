import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardCollectionEntry } from "~/lib/api"
import { NamecardCollection } from "~/pages/account/me/collection/namecard-collection"
import { makeNamecard } from "@/mocks/data/namecards"
import { makeNamecardCharacterCatalog } from "@/mocks/data/characters"
import { renderPage } from "@/tests/unit/support/harness"

const apiMocks = vi.hoisted(() => ({
  getNamecardCollectionPage: vi.fn(),
  setNamecardCollectionHidden: vi.fn(),
  getFudabaSeries: vi.fn(),
  getNamecardReactions: vi.fn(),
  addNamecardReaction: vi.fn(),
  sendPage: vi.fn(),
  sendHide: vi.fn(),
  sendReactions: vi.fn(),
  sendAddReaction: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getNamecardCollectionPage: apiMocks.getNamecardCollectionPage,
    setNamecardCollectionHidden: apiMocks.setNamecardCollectionHidden,
    getFudabaSeries: apiMocks.getFudabaSeries,
    getNamecardReactions: apiMocks.getNamecardReactions,
    addNamecardReaction: apiMocks.addNamecardReaction,
  }
})

vi.mock("~/lib/use-namecard-character-catalog", () => ({
  useNamecardCharacterCatalog: () => ({
    catalog: makeNamecardCharacterCatalog(),
    loading: false,
    failed: false,
  }),
  resetNamecardCharacterCatalogCache: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: toastMocks }))

const snapshot: NamecardCollectionEntry["snapshot"] = {
  producerName: "天海春香",
  producerReading: null,
  groupName: null,
  madeOn: null,
  bio: null,
  tradeNote: null,
  isOriginal: false,
  madeWithAi: false,
  exchangeMode: "manual",
  accent: null,
  seriesCodes: ["765"],
  credits: [],
  sortNameKey: "amami haruka",
  sortNameBucket: 1,
  favoriteCharacterIds: [1],
}

function entry(
  overrides: Partial<NamecardCollectionEntry> = {}
): NamecardCollectionEntry {
  const cardNumber = overrides.cardNumber ?? 42
  return {
    cardNumber,
    obtainedAt: "2026-08-01T00:00:00.000Z",
    hiddenAt: null,
    available: true,
    own: false,
    card: makeNamecard({
      id: cardNumber,
      cardNumber,
      cardId: `card-${cardNumber}`,
      hasOwner: true,
      claimStatus: "claimed",
      claimerUid: 4242,
    }),
    snapshot,
    ...overrides,
  }
}

function pageResult(
  list: NamecardCollectionEntry[] = [entry()],
  totalPage = 1
) {
  return { list, total: list.length * totalPage, totalPage }
}

function lastQuery() {
  return apiMocks.getNamecardCollectionPage.mock.calls.at(-1)?.[0]
}

function renderCollection() {
  return renderPage(<NamecardCollection />)
}

beforeEach(() => {
  vi.resetAllMocks()
  apiMocks.getNamecardCollectionPage.mockReturnValue({
    send: apiMocks.sendPage,
  })
  apiMocks.setNamecardCollectionHidden.mockReturnValue({
    send: apiMocks.sendHide,
  })
  apiMocks.getNamecardReactions.mockReturnValue({
    send: apiMocks.sendReactions,
  })
  apiMocks.addNamecardReaction.mockReturnValue({
    send: apiMocks.sendAddReaction,
  })
  apiMocks.getFudabaSeries.mockReturnValue({
    send: vi.fn().mockResolvedValue({
      items: [{ code: "765", displayName: "本家", color: "#f34f6d" }],
    }),
  })
  apiMocks.sendPage.mockResolvedValue(pageResult())
  apiMocks.sendHide.mockResolvedValue({ success: true })
  apiMocks.sendReactions.mockResolvedValue({})
  apiMocks.sendAddReaction.mockResolvedValue({ ok: true })
})

describe("NamecardCollection", () => {
  it("asks for the first page of 24 with the default sort", async () => {
    renderCollection()

    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())
    expect(apiMocks.getNamecardCollectionPage).toHaveBeenCalledWith({
      page: 1,
      size: 24,
      sort: "exchange",
      dir: "desc",
      q: undefined,
      series: [],
      group: undefined,
      character: [],
      match: "any",
      excludeOther: false,
      excludeCross: false,
      includeOwn: false,
      includeHidden: false,
    })
  })

  it("passes the debounced search and every advanced filter to the query", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.type(screen.getByLabelText("搜索制作人"), "春香")
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: "春香" }), {
      timeout: 3000,
    })

    await user.click(screen.getByRole("button", { name: /高级筛选/ }))
    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    await user.click(screen.getByRole("checkbox", { name: /同时包含/ }))
    await user.click(screen.getByRole("checkbox", { name: /本家/ }))
    await user.type(screen.getByLabelText("所属团体"), "765")
    await user.click(screen.getByRole("checkbox", { name: /不含越境/ }))

    await waitFor(() =>
      expect(lastQuery()).toMatchObject({
        q: "春香",
        character: [1],
        match: "all",
        series: ["765"],
        group: "765",
        excludeCross: true,
      })
    )
  })

  it("includes my own and hidden cards only when their switch is on", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(screen.getByRole("checkbox", { name: /显示我的名片/ }))
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ includeOwn: true })
    )

    await user.click(screen.getByRole("checkbox", { name: /显示隐藏名片/ }))
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({
        includeOwn: true,
        includeHidden: true,
      })
    )
  })

  it("dims manually hidden entries", async () => {
    apiMocks.sendPage.mockResolvedValue(
      pageResult([entry({ hiddenAt: "2026-08-02T00:00:00.000Z" })])
    )
    renderCollection()

    const tile = await screen.findByRole("button", { name: "查看名片 #42" })
    expect(tile).toHaveClass("opacity-70")
  })

  it("jumps pages from the arrows and the page dropdown", async () => {
    const user = userEvent.setup()
    apiMocks.sendPage.mockResolvedValue(pageResult([entry()], 3))
    renderCollection()
    await screen.findByRole("button", { name: "查看名片 #42" })

    await user.click(screen.getByRole("button", { name: "下一页" }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }))
    expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: /选择页码/ }))
    await user.click(screen.getByRole("button", { name: "第 3 页" }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 3 }))
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled()
  })

  it("hides and restores a collected card from the detail dialog", async () => {
    const user = userEvent.setup()
    renderCollection()
    await user.click(await screen.findByRole("button", { name: "查看名片 #42" }))

    const hide = await screen.findByRole("button", { name: "隐藏" })
    await user.click(hide)

    expect(apiMocks.setNamecardCollectionHidden).toHaveBeenCalledWith(42, true)
    expect(apiMocks.sendHide).toHaveBeenCalled()
    const restore = await screen.findByRole("button", { name: "取消隐藏" })
    expect(toastMocks.success).toHaveBeenCalledWith("已隐藏这张名片")

    await user.click(restore)
    expect(apiMocks.setNamecardCollectionHidden).toHaveBeenLastCalledWith(
      42,
      false
    )
    expect(
      await screen.findByRole("button", { name: "隐藏" })
    ).toBeInTheDocument()
  })

  it("never offers the hide action on my own card", async () => {
    apiMocks.sendPage.mockResolvedValue(
      pageResult([
        entry({
          own: true,
          card: makeNamecard({
            id: 42,
            cardNumber: 42,
            cardId: "card-42",
            canEdit: true,
            hasOwner: true,
            claimStatus: "claimed",
          }),
        }),
      ])
    )
    const user = userEvent.setup()
    renderCollection()

    await user.click(await screen.findByRole("button", { name: "查看名片 #42" }))
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).queryByRole("button", { name: "隐藏" })
    ).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole("button", { name: "取消隐藏" })
    ).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole("button", { name: "交换名片" })
    ).not.toBeInTheDocument()
  })
})
