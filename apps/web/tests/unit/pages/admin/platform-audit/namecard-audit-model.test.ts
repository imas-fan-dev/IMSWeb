import { describe, expect, test } from "vitest"

import {
  auditTab,
  auditUserBadge,
  auditUserLabel,
  auditUserTitle,
  AUDIT_TABS,
  formatAuditMoment,
} from "~/pages/admin/platform-audit/namecard-audit-model"

describe("namecard audit model", () => {
  test("falls back to the lock table for an unknown tab", () => {
    expect(auditTab(null)).toBe("locks")
    expect(auditTab("feedback")).toBe("feedback")
    expect(auditTab("history")).toBe("locks")
    expect(AUDIT_TABS.map((tab) => tab.label)).toEqual(["锁定记录", "反馈记录"])
  })

  test("annotates a name only once the account repeats", () => {
    expect(auditUserLabel({ name: "调试用户", total: 1, pageCount: 1 })).toBe(
      "调试用户"
    )
    expect(auditUserLabel({ name: "调试用户", total: 3, pageCount: 1 })).toBe(
      "调试用户 (3 次)"
    )
  })

  test("keeps the repeat annotation weak and absent for a single record", () => {
    expect(auditUserBadge({ name: "调试用户", total: 1, pageCount: 1 })).toBeNull()
    expect(auditUserBadge({ name: "调试用户", total: 4, pageCount: 1 })).toBe(
      "(4 次)"
    )
  })

  test("separates the lifetime total from the rows on this page", () => {
    expect(auditUserTitle({ name: "调试用户", total: 7, pageCount: 2 })).toBe(
      "调试用户：本页 2 条，累计 7 条"
    )
  })

  test("prints an em dash for a missing moment", () => {
    expect(formatAuditMoment(null)).toBe("—")
    expect(formatAuditMoment("2026-10-30T14:48:15.000Z")).toMatch(/2026/)
  })
})
