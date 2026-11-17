import { describe, expect, it } from "vitest"

import { ApiError } from "~/lib/api"
import { adminErrorMessage } from "~/lib/admin-error"

function conflict(payload: unknown) {
  return new ApiError("请求失败（HTTP 409）", {
    kind: "http",
    status: 409,
    payload,
  })
}

describe("adminErrorMessage", () => {
  it("keeps the server reason when a 409 explains itself", () => {
    expect(
      adminErrorMessage(
        conflict({
          success: false,
          code: "FUDABA_CARD_CLAIM_REVIEW_INVALID",
          message: "认领目标不可用",
        })
      )
    ).toBe("认领目标不可用")
  })

  it("falls back to the refresh hint for a bare revision conflict", () => {
    // 版本竞争只带 code 与 revision；这时「刷新后重试」才是准确的说法。
    expect(
      adminErrorMessage(
        conflict({ success: false, code: "FUDABA_CARD_REVIEW_CONFLICT", revision: 3 })
      )
    ).toBe("内容已被其他操作更新，请刷新后重试。")
  })

  it("still explains auth and permission failures in its own words", () => {
    expect(
      adminErrorMessage(
        new ApiError("请求失败（HTTP 403）", { kind: "http", status: 403 })
      )
    ).toBe("当前账号没有执行此操作的权限。")
  })
})
