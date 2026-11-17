import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { UserEvent } from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NamecardClaimDialog } from "~/components/community/namecard-claim-dialog"
import {
  NamecardWallFields,
  wallCardChanged,
  wallCardDraftFromCard,
  wallCardPayload,
  type WallCardDraft,
  type WallCardFieldMode,
} from "~/components/community/namecard-wall-fields"
import type { SeriesOption } from "~/components/community/series-multi-select"
import type { Namecard } from "~/lib/api"
import { resetNamecardCharacterCatalogCache } from "~/lib/use-namecard-character-catalog"
import { makeNamecardCharacterCatalog } from "@/mocks/data/characters"

const apiMocks = vi.hoisted(() => ({
  sendCharacterCatalog: vi.fn(),
  getNamecardCharacterCatalog: vi.fn(),
  sendWikiCatalog: vi.fn(),
  getWikiCatalog: vi.fn(),
  sendOwnerCards: vi.fn(),
  getFudabaOwnerCards: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getNamecardCharacterCatalog: apiMocks.getNamecardCharacterCatalog,
    getWikiCatalog: apiMocks.getWikiCatalog,
    getFudabaOwnerCards: apiMocks.getFudabaOwnerCards,
  }
})

vi.mock(
  "~/components/platform/platform-session-provider",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/components/platform/platform-session-provider")
      >()
    return {
      ...actual,
      useOptionalPlatformSession: sessionMocks.useOptionalPlatformSession,
    }
  }
)

vi.mock("sonner", () => ({
  toast: toastMocks,
}))

const SERIES: SeriesOption[] = [
  { code: "765", displayName: "765PRO ALLSTARS", color: "#f34e6c" },
  { code: "cg", displayName: "CINDERELLA GIRLS", color: "#2681c8" },
]

function draft(overrides: Partial<WallCardDraft> = {}): WallCardDraft {
  return {
    producerName: "",
    producerReading: null,
    groupName: null,
    isGroupCard: false,
    madeOn: null,
    seriesCodes: [],
    favoriteCharacterIds: [],
    ...overrides,
  }
}

/** The wall card the claim dialog starts from: nothing filled in yet. */
function wallCard(overrides: Partial<Namecard> = {}): Namecard {
  return {
    id: 41,
    cardId: "41",
    cardNumber: 41,
    revision: 0,
    producerName: null,
    producerReading: null,
    groupName: null,
    madeOn: null,
    isOriginal: false,
    madeWithAi: false,
    bio: null,
    tradeNote: null,
    exchangeMode: "auto",
    accent: null,
    seriesCode: null,
    seriesCodes: [],
    favoriteCharacters: [],
    credits: [],
    canEdit: false,
    hasOwner: false,
    claimStatus: "unclaimed",
    viewerClaimState: null,
    claimerName: null,
    claimerUid: null,
    supplementPending: false,
    ...overrides,
  } as Namecard
}

/**
 * The component is fully controlled, so the harness holds the draft the way the
 * claim and supplement dialogs do; `onChange` also spies on every patch.
 */
function FieldsHarness({
  mode = "claim",
  initial,
  disabled = false,
  onChange,
}: {
  mode?: WallCardFieldMode
  initial: WallCardDraft
  disabled?: boolean
  onChange?: (next: WallCardDraft) => void
}) {
  const [current, setCurrent] = useState(initial)
  return (
    <NamecardWallFields
      mode={mode}
      draft={current}
      series={SERIES}
      disabled={disabled}
      onChange={(next) => {
        setCurrent(next)
        onChange?.(next)
      }}
    />
  )
}

async function chooseOption(
  user: UserEvent,
  filter: string,
  option: string
): Promise<void> {
  await user.click(screen.getByRole("combobox", { name: filter }))
  await user.click(await screen.findByRole("option", { name: option }))
}

function renderFields(
  options: {
    mode?: WallCardFieldMode
    initial?: WallCardDraft
    disabled?: boolean
    onChange?: (next: WallCardDraft) => void
  } = {}
) {
  return render(
    <FieldsHarness
      mode={options.mode ?? "claim"}
      initial={options.initial ?? draft()}
      disabled={options.disabled ?? false}
      onChange={options.onChange}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetNamecardCharacterCatalogCache()
  apiMocks.sendCharacterCatalog.mockResolvedValue(
    makeNamecardCharacterCatalog()
  )
  apiMocks.getNamecardCharacterCatalog.mockReturnValue({
    send: apiMocks.sendCharacterCatalog,
  })
  apiMocks.sendWikiCatalog.mockResolvedValue({
    agencies: [
      { code: "765", name: "765PRO ALLSTARS", color: "#f34e6c" },
      { code: "cg", name: "CINDERELLA GIRLS", color: "#2681c8" },
    ],
  })
  apiMocks.getWikiCatalog.mockReturnValue({ send: apiMocks.sendWikiCatalog })
  apiMocks.sendOwnerCards.mockResolvedValue({ items: [] })
  apiMocks.getFudabaOwnerCards.mockReturnValue({
    send: apiMocks.sendOwnerCards,
  })
  sessionMocks.useOptionalPlatformSession.mockReturnValue({
    status: "authenticated",
  })
})

describe("wallCardDraftFromCard", () => {
  it("turns the missing text fields into empty values", () => {
    const card = {
      producerName: null,
      producerReading: null,
      groupName: null,
      madeOn: null,
      seriesCodes: [],
      favoriteCharacters: [],
    }

    expect(wallCardDraftFromCard(card)).toEqual({
      producerName: "",
      producerReading: null,
      groupName: null,
      isGroupCard: false,
      madeOn: null,
      seriesCodes: [],
      favoriteCharacterIds: [],
    })
  })

  it("copies the series array and flattens the favourite characters to ids", () => {
    const seriesCodes = ["765", "cg"]
    const card = {
      producerName: "春香P",
      producerReading: "はるか",
      groupName: "765PRO",
      madeOn: "2025-10-07",
      seriesCodes,
      favoriteCharacters: [{ id: 1 }, { id: 3 }],
    }

    const result = wallCardDraftFromCard(card)

    expect(result).toEqual({
      producerName: "春香P",
      producerReading: "はるか",
      groupName: "765PRO",
      isGroupCard: false,
      madeOn: "2025-10-07",
      seriesCodes: ["765", "cg"],
      favoriteCharacterIds: [1, 3],
    })
    // The draft owns its array: later wall edits must not mutate the card.
    seriesCodes.push("ml")
    expect(result.seriesCodes).toEqual(["765", "cg"])
  })
})

describe("wallCardPayload", () => {
  const live = draft({
    producerName: "春香P",
    producerReading: "はるか",
    groupName: "765PRO",
    madeOn: "2025-10-07",
    seriesCodes: ["765"],
    favoriteCharacterIds: [1],
  })

  it("returns nothing when the draft matches the live card", () => {
    expect(wallCardPayload("claim", live, live)).toEqual({})
    expect(wallCardChanged("claim", live, live)).toBe(false)
  })

  it("returns only the fields that actually changed", () => {
    // Whitespace is not a change for the producer name; the group is.
    expect(
      wallCardPayload("claim", { ...live, producerName: " 春香P " }, live)
    ).toEqual({})
    expect(
      wallCardChanged(
        "claim",
        { ...live, producerName: " 春香P ", groupName: "876PRO" },
        live
      )
    ).toBe(true)

    const patch = wallCardPayload(
      "claim",
      { ...live, producerName: " 千早P ", groupName: "876PRO" },
      live
    )
    expect(patch).toEqual({ producerName: "千早P", groupName: "876PRO" })
  })

  it("keeps the reading and the production date out of a supplement", () => {
    const changed = {
      ...live,
      producerReading: "ちはや",
      madeOn: "2024-02-28",
    }

    expect(wallCardPayload("claim", changed, live)).toEqual({
      producerReading: "ちはや",
      madeOn: "2024-02-28",
    })
    expect(wallCardPayload("supplement", changed, live)).toEqual({})

    // The supplement still owns the three text/multi-select fields.
    expect(
      wallCardPayload(
        "supplement",
        { ...live, groupName: "876PRO", seriesCodes: ["cg"], madeOn: null },
        live
      )
    ).toEqual({ groupName: "876PRO", seriesCodes: ["cg"] })
  })

  it("compares series in order but characters as a set", () => {
    const twoSeries = draft({
      producerName: "春香P",
      seriesCodes: ["765", "cg"],
      favoriteCharacterIds: [1, 2],
    })

    expect(
      wallCardPayload(
        "claim",
        { ...twoSeries, seriesCodes: ["cg", "765"] },
        twoSeries
      )
    ).toEqual({ seriesCodes: ["cg", "765"] })
    expect(
      wallCardPayload(
        "claim",
        { ...twoSeries, favoriteCharacterIds: [2, 1] },
        twoSeries
      )
    ).toEqual({})
  })
})

describe("NamecardClaimDialog required fields", () => {
  it("keeps the claim button disabled until the required fields are filled", async () => {
    render(
      <NamecardClaimDialog
        card={wallCard()}
        open
        onOpenChange={vi.fn()}
        onSubmitted={vi.fn()}
      />
    )

    // 必填项由星号与原生 required 表达，不再额外给一段提示文案。
    expect(
      await screen.findByRole("textbox", { name: "制作人名称" })
    ).toHaveValue("")
    expect(screen.getByRole("button", { name: /提交认领审核/ })).toBeDisabled()
    expect(screen.getByRole("group", { name: "企划" })).toBeTruthy()
  })

  it("requires the group name instead of the producer name on a group card", async () => {
    render(
      <NamecardClaimDialog
        card={wallCard()}
        open
        onOpenChange={vi.fn()}
        onSubmitted={vi.fn()}
      />
    )

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /团体名片/ })
    )
    expect(
      screen.getByRole("textbox", { name: "制作人名称" })
    ).not.toBeRequired()
    expect(screen.getByRole("textbox", { name: "团体名称" })).toBeRequired()
    expect(screen.getByRole("button", { name: /提交认领审核/ })).toBeDisabled()
  })
})

describe("NamecardWallFields", () => {
  it("renders the six claim fields with the labels the dialog uses", async () => {
    renderFields({
      initial: draft({
        producerName: "春香P",
        producerReading: "はるか",
        groupName: "765PRO",
        madeOn: "2025-10-07",
        seriesCodes: ["765"],
        favoriteCharacterIds: [1],
      }),
    })

    expect(screen.getByRole("textbox", { name: "制作人名称" })).toHaveValue(
      "春香P"
    )
    expect(screen.getByRole("textbox", { name: "制作人名读音" })).toHaveValue(
      "はるか"
    )
    expect(screen.getByRole("textbox", { name: "团体名称" })).toHaveValue(
      "765PRO"
    )
    expect(screen.getByText("制作时间")).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "制作年份" })).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "制作月份" })).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "制作日期" })).toBeTruthy()
    expect(screen.getByRole("group", { name: "企划" })).toBeTruthy()
    expect(screen.getByRole("group", { name: "担当角色候选" })).toBeTruthy()

    // 制作人名称 and 企划 are required in claim mode.
    expect(screen.getAllByText("*")).toHaveLength(2)
  })

  it("renders only the four supplement fields", () => {
    renderFields({ mode: "supplement" })

    expect(screen.getByRole("textbox", { name: "制作人名称" })).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: "制作人名读音" })).toBeNull()
    expect(screen.queryByText("制作时间")).toBeNull()
    expect(screen.queryByRole("combobox", { name: "制作年份" })).toBeNull()
    expect(screen.getByRole("textbox", { name: "团体名称" })).toBeTruthy()
    expect(screen.getByRole("group", { name: "企划" })).toBeTruthy()
    expect(screen.getByRole("group", { name: "担当角色候选" })).toBeTruthy()
    // Only the series field keeps its required marker.
    expect(screen.getAllByText("*")).toHaveLength(1)
  })

  it("reports the text edits, normalising the reading and clearing the group", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFields({ onChange })

    await user.type(
      screen.getByRole("textbox", { name: "制作人名读音" }),
      "ぜいぜい！"
    )
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ producerReading: "ぜいぜい" })
    )

    const group = screen.getByRole("textbox", { name: "团体名称" })
    await user.type(group, "765PRO")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ groupName: "765PRO" })
    )

    await user.clear(group)
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ groupName: null })
    )
  })

  it("reports a series checkbox and can no longer untick it for a chosen character", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFields({ onChange })

    await user.click(
      within(screen.getByRole("group", { name: "企划" })).getByRole(
        "checkbox",
        { name: /765PRO ALLSTARS/ }
      )
    )
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ seriesCodes: ["765"] })
    )

    await user.click(await screen.findByRole("checkbox", { name: /天海春香/ }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        favoriteCharacterIds: [1],
        seriesCodes: ["765"],
      })
    )

    // The character's series is locked: its checkbox stays checked and disabled.
    const lockedSeries = within(
      screen.getByRole("group", { name: "企划" })
    ).getByRole("checkbox", { name: /765PRO ALLSTARS/ })
    expect(lockedSeries).toHaveAttribute("aria-checked", "true")
    expect(lockedSeries).toHaveAttribute("aria-disabled", "true")
  })

  it("adds a character's agency to the series when the wall starts empty", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFields({ onChange })

    await user.click(await screen.findByRole("checkbox", { name: /涩谷凛/ }))

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        favoriteCharacterIds: [3],
        seriesCodes: ["cg"],
      })
    )
  })

  it("joins the production date parts and drops a day the new month lacks", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderFields({ onChange })

    await chooseOption(user, "制作年份", "2025 年")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ madeOn: "2025" })
    )
    expect(screen.getByRole("combobox", { name: "制作月份" })).toBeEnabled()
    expect(screen.getByRole("combobox", { name: "制作日期" })).toBeDisabled()

    await chooseOption(user, "制作月份", "10 月")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ madeOn: "2025-10" })
    )
    expect(screen.getByRole("combobox", { name: "制作日期" })).toBeEnabled()

    await chooseOption(user, "制作日期", "31 日")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ madeOn: "2025-10-31" })
    )

    // A month with 31 days keeps the chosen day.
    await chooseOption(user, "制作月份", "12 月")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ madeOn: "2025-12-31" })
    )

    // February has no 31st, so the day is dropped rather than carried over.
    await chooseOption(user, "制作月份", "2 月")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ madeOn: "2025-02" })
    )

    await chooseOption(user, "制作日期", "28 日")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ madeOn: "2025-02-28" })
    )

    // Each part can be cleared on its own.
    await chooseOption(user, "制作日期", "-")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ madeOn: "2025-02" })
    )

    await chooseOption(user, "制作年份", "-")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ madeOn: null })
    )
  })

  it("disables every control while the dialog is submitting", async () => {
    renderFields({
      initial: draft({ producerName: "春香P", madeOn: "2025-10-07" }),
      disabled: true,
    })

    expect(screen.getByRole("textbox", { name: "制作人名称" })).toBeDisabled()
    expect(screen.getByRole("textbox", { name: "制作人名读音" })).toBeDisabled()
    expect(screen.getByRole("textbox", { name: "团体名称" })).toBeDisabled()
    expect(screen.getByRole("combobox", { name: "制作年份" })).toBeDisabled()
    expect(
      within(screen.getByRole("group", { name: "企划" })).getByRole(
        "checkbox",
        { name: /765PRO ALLSTARS/ }
      )
    ).toHaveAttribute("aria-disabled", "true")
    expect(
      await screen.findByRole("checkbox", { name: /天海春香/ })
    ).toHaveAttribute("aria-disabled", "true")
  })

  it("surfaces a toast when the character catalog cannot load", async () => {
    apiMocks.sendCharacterCatalog.mockRejectedValueOnce(new Error("boom"))
    renderFields()

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "担当角色目录载入失败，请稍后重试"
      )
    )
  })
})
