import { describe, expect, it } from "vitest"

import { claimRows } from "~/pages/admin/cards/claim-review-dialog"
import type { AdminNamecardDiff, FudabaAdminCardClaim } from "~/lib/api"

type DiffSide = AdminNamecardDiff["live"]

/** 审核窗只用到这三个取标签的函数；测试里直接用代号就够。 */
const labels = {
  seriesLabel: (code: string) => code,
  seriesList: (codes: readonly string[]) => codes.join("、"),
  characterList: (ids: readonly number[]) => ids.join("、"),
}

function claim(
  overrides: Partial<FudabaAdminCardClaim> = {}
): FudabaAdminCardClaim {
  return {
    id: "claim-1",
    legacyCardId: 788,
    targetCardId: null,
    seriesCode: "gaku",
    payload: {},
    favoriteCharacters: [],
    state: "pending",
    message: "",
    reviewNote: "",
    revision: 3,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    reviewedAt: null,
    targetCardNumber: null,
    claimant: { id: "acct-1", displayName: "春香P" },
    legacyCard: { id: 788, pages: [] },
    ...overrides,
  }
}

function side(overrides: Partial<DiffSide> = {}): DiffSide {
  return {
    producerName: "luckylukeP",
    producerReading: "らっきーるーく",
    groupName: null,
    isGroupCard: false,
    madeOn: null,
    bio: null,
    tradeNote: null,
    isOriginal: false,
    madeWithAi: false,
    visible: true,
    exchangeMode: "auto",
    seriesCodes: ["765as"],
    credits: [],
    favoriteCharacters: [],
    pages: [],
    ...overrides,
  }
}

describe("claim review rows", () => {
  it("lists the requested rotation so the reviewer sees the new orientation", () => {
    const rows = claimRows(
      claim({ payload: { rotations: { front: 3 } } }),
      null,
      labels
    )

    expect(rows.at(-1)).toEqual({
      label: "图片旋转",
      live: null,
      pending: "正面 270°",
    })
  })

  it("joins both faces and leaves the upright ones out", () => {
    const rows = claimRows(
      claim({ payload: { rotations: { front: 1, back: 3 } } }),
      null,
      labels
    )

    expect(rows.at(-1)?.pending).toBe("正面 90°、背面 270°")
  })

  it("omits the rotation row for a claim that only changes fields", () => {
    const rows = claimRows(
      claim({ payload: { producerName: "HATAYA" } }),
      null,
      labels
    )

    expect(rows.some((row) => row.label === "图片旋转")).toBe(false)
  })

  it("keeps the binding comparison free of rotation rows", () => {
    // 绑定型认领提交时不带旋转，审核窗也把 payload 清空后再比对。
    const rows = claimRows(claim(), null, labels, side())

    expect(rows.some((row) => row.label === "图片旋转")).toBe(false)
  })
})
