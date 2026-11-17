import { expect, it } from "vitest"
import { exchangeSearchStatus } from "~/pages/community/exchange/components/exchange-search-status"

it("does not display successful search explanations above results", () => {
  expect(
    exchangeSearchStatus({
      busy: false,
      error: null,
      notice: "已扩大搜索范围，按距离排序。",
      searched: true,
      resultCount: 5,
    })
  ).toBeNull()
})

it("retains loading, empty, errors and independent map feedback", () => {
  const state = { busy: false, error: null, searched: true, resultCount: 0 }
  expect(exchangeSearchStatus({ ...state, busy: true })?.kind).toBe("loading")
  expect(exchangeSearchStatus(state)?.kind).toBe("empty")
  expect(exchangeSearchStatus({ ...state, error: "服务暂不可用" })?.kind).toBe(
    "error"
  )
  expect(
    exchangeSearchStatus({
      ...state,
      searched: false,
      feedback: { kind: "notice", message: "地图信息" },
    })?.title
  ).toBe("地图信息")
})
