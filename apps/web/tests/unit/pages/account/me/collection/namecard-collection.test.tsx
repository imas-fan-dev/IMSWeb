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
  getNamecardCollectionOwners: vi.fn(),
  setNamecardCollectionHidden: vi.fn(),
  getFudabaSeries: vi.fn(),
  getNamecardReactions: vi.fn(),
  addNamecardReaction: vi.fn(),
  sendPage: vi.fn(),
  sendOwners: vi.fn(),
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
    getNamecardCollectionOwners: apiMocks.getNamecardCollectionOwners,
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

vi.mock(
  "~/components/platform/platform-session-provider",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/components/platform/platform-session-provider")
      >()
    return {
      ...actual,
      useOptionalPlatformSession: () =>
        ({
          status: "authenticated",
          session: { account: { id: "acc-1" } },
          error: null,
          acceptSession: vi.fn(),
          acceptProfile: vi.fn(),
          reload: vi.fn(),
          logout: vi.fn(),
        }) as unknown as ReturnType<typeof actual.useOptionalPlatformSession>,
    }
  }
)

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
    owner: { accountId: "acc-1", uid: "4242", displayName: "春日未来" },
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
  window.localStorage.clear()
  apiMocks.getNamecardCollectionPage.mockReturnValue({
    send: apiMocks.sendPage,
  })
  apiMocks.getNamecardCollectionOwners.mockReturnValue({
    send: apiMocks.sendOwners,
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
  apiMocks.sendOwners.mockResolvedValue({
    list: [
      {
        accountId: "acc-1",
        uid: 7,
        displayName: "春日未来",
        avatarUrl: null,
      },
    ],
  })
  apiMocks.sendHide.mockResolvedValue({ success: true })
  apiMocks.sendReactions.mockResolvedValue({})
  apiMocks.sendAddReaction.mockResolvedValue({ ok: true })
})

describe("NamecardCollection", () => {
  it("searches the collection owners by nickname", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    await user.type(screen.getByLabelText("所属用户"), "未来")

    await waitFor(
      () =>
        expect(apiMocks.getNamecardCollectionOwners).toHaveBeenCalledWith({
          q: "未来",
          limit: 8,
        }),
      { timeout: 3000 }
    )
    expect(
      await screen.findByRole("option", { name: "春日未来" })
    ).toBeVisible()
  })

  it("filters by the chosen owner and clears the choice", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    await user.type(screen.getByLabelText("所属用户"), "未来")
    await user.click(await screen.findByRole("button", { name: "春日未来" }))

    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ owner: "acc-1", page: 1 })
    )

    await user.click(screen.getByRole("button", { name: "清空所属用户" }))

    await waitFor(() => expect(lastQuery()).toMatchObject({ owner: undefined }))
    expect(screen.getByLabelText("所属用户")).toBeVisible()
  })

  it("clears the owner filter from the reset button", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    await user.type(screen.getByLabelText("所属用户"), "未来")
    await user.click(await screen.findByRole("button", { name: "春日未来" }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ owner: "acc-1" }))

    await user.click(screen.getAllByRole("button", { name: "清空筛选" })[0])

    await waitFor(() => expect(lastQuery()).toMatchObject({ owner: undefined }))
    expect(screen.getByLabelText("所属用户")).toBeVisible()
  })

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
      owner: undefined,
      character: [],
      match: "any",
      excludeOther: false,
      excludeCross: false,
      invert: false,
      declaration: undefined,
      includeOwn: false,
      includeHidden: false,
    })
  })

  it("maps sort changes onto the query with each key's default direction", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(screen.getByRole("combobox", { name: "排序方式" }))
    await user.click(await screen.findByRole("option", { name: "制作人名" }))
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ sort: "name", dir: "asc", page: 1 })
    )

    await user.click(screen.getByRole("combobox", { name: "排序方式" }))
    await user.click(await screen.findByRole("option", { name: "制作日期" }))
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ sort: "date", dir: "desc", page: 1 })
    )
  })

  it("flips the direction without changing the sort", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(
      screen.getByRole("button", { name: "当前降序，切换为升序" })
    )
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ sort: "exchange", dir: "asc" })
    )
  })

  it("keeps the chosen sort after clearing the filters", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(screen.getByRole("combobox", { name: "排序方式" }))
    await user.click(await screen.findByRole("option", { name: "制作人名" }))
    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    await user.type(screen.getByLabelText("制作人名称"), "春香")
    await waitFor(
      () =>
        expect(lastQuery()).toMatchObject({
          sort: "name",
          dir: "asc",
          q: "春香",
        }),
      { timeout: 3000 }
    )

    await user.click(screen.getAllByRole("button", { name: "清空筛选" })[0])
    await waitFor(
      () =>
        expect(lastQuery()).toMatchObject({
          sort: "name",
          dir: "asc",
          q: undefined,
        }),
      { timeout: 3000 }
    )
  })

  it("passes the debounced search and every collapsed filter to the query", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(screen.getByRole("button", { name: /^筛选/ }))
    await user.type(screen.getByLabelText("制作人名称"), "春香")
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: "春香" }), {
      timeout: 3000,
    })

    await user.click(screen.getByRole("textbox", { name: "搜索担当角色" }))
    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    await user.click(screen.getByRole("checkbox", { name: /同时包含/ }))
    await user.click(screen.getByRole("textbox", { name: "搜索企划" }))
    await user.click(screen.getByRole("checkbox", { name: /本家/ }))
    await user.type(screen.getByLabelText("所属团体"), "765")
    await user.click(screen.getByRole("checkbox", { name: /不含越境/ }))
    await user.click(screen.getByRole("checkbox", { name: /反向排除/ }))
    await user.click(screen.getByRole("combobox", { name: "创作声明" }))
    await user.click(await screen.findByRole("option", { name: "AI" }))

    await waitFor(() =>
      expect(lastQuery()).toMatchObject({
        q: "春香",
        character: [1],
        match: "all",
        series: ["765"],
        group: "765",
        excludeCross: true,
        invert: true,
        declaration: "ai",
      })
    )
  })

  it("includes my own and hidden cards only when their switch is on", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(screen.getByRole("button", { name: "显示设置" }))
    await user.click(
      await screen.findByRole("checkbox", { name: /显示我的名片/ })
    )
    await waitFor(() => expect(lastQuery()).toMatchObject({ includeOwn: true }))

    await user.click(screen.getByRole("checkbox", { name: /显示隐藏名片/ }))
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({
        includeOwn: true,
        includeHidden: true,
      })
    )
  })

  it("keeps both display switches inside the settings popover", async () => {
    const user = userEvent.setup()
    renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    expect(
      screen.queryByRole("checkbox", { name: "显示我的名片" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("checkbox", { name: "显示隐藏名片" })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "显示设置" }))

    expect(
      await screen.findByRole("checkbox", { name: "显示我的名片" })
    ).toBeVisible()
    expect(screen.getByRole("checkbox", { name: "显示隐藏名片" })).toBeVisible()
  })

  it("contains the thumbnail in a square frame and names the producer below", async () => {
    renderCollection()

    const tile = await screen.findByRole("button", { name: "查看名片 #42" })
    expect(tile).toHaveClass("aspect-square", "rounded-lg", "border")
    const image = tile.querySelector("img")
    expect(image).toHaveClass("object-contain", "border")
    const grid = screen.getByRole("region", { name: "收集的名片" })
    expect(within(grid).getByText("天海春香")).toBeVisible()
    expect(
      within(grid).getByRole("link", { name: "天海春香" })
    ).toHaveAttribute("href", "/user/4242")
  })

  it("falls back to plain text when the owner is unknown", async () => {
    apiMocks.sendPage.mockResolvedValue(pageResult([entry({ owner: null })]))
    renderCollection()

    const grid = await screen.findByRole("region", { name: "收集的名片" })
    expect(await within(grid).findByText("天海春香")).toBeVisible()
    expect(
      within(grid).queryByRole("link", { name: "天海春香" })
    ).not.toBeInTheDocument()
  })

  it("renders nothing for an entry whose card was deleted", async () => {
    apiMocks.sendPage.mockResolvedValue(pageResult([entry({ card: null })]))
    renderCollection()

    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())
    const grid = screen.getByRole("region", { name: "收集的名片" })
    expect(within(grid).queryByText("天海春香")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "查看名片 #42" })
    ).not.toBeInTheDocument()
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
    await user.click(
      await screen.findByRole("button", { name: "查看名片 #42" })
    )

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

    await user.click(
      await screen.findByRole("button", { name: "查看名片 #42" })
    )
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

  it("remembers 显示我的名片 per account, defaulting to off", async () => {
    const user = userEvent.setup()
    const first = renderCollection()
    await waitFor(() => expect(apiMocks.sendPage).toHaveBeenCalled())

    await user.click(screen.getByRole("button", { name: "显示设置" }))
    const toggle = await screen.findByRole("checkbox", {
      name: /显示我的名片/,
    })
    expect(toggle).not.toBeChecked()
    expect(lastQuery()).toMatchObject({ includeOwn: false })

    await user.click(toggle)
    await waitFor(() => expect(lastQuery()).toMatchObject({ includeOwn: true }))
    expect(
      window.localStorage.getItem("imsweb.namecard-album.show-own.acc-1")
    ).toBe("true")

    first.unmount()

    renderCollection()
    await waitFor(() => expect(lastQuery()).toMatchObject({ includeOwn: true }))
    await user.click(screen.getByRole("button", { name: "显示设置" }))
    expect(
      await screen.findByRole("checkbox", { name: /显示我的名片/ })
    ).toBeChecked()
  })
})
