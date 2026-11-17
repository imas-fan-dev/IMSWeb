import type { NamecardAuditUser } from "@imsweb/contracts/namecards"

export type AuditTab = "locks" | "feedback"

export const AUDIT_TABS: readonly { value: AuditTab; label: string }[] = [
  { value: "locks", label: "锁定记录" },
  { value: "feedback", label: "反馈记录" },
]

export function auditTab(value: string | null): AuditTab {
  return value === "feedback" ? "feedback" : "locks"
}

/**
 * The table annotates a name with its lifetime record count so repeat offenders
 * and heavy reporters stand out; the page count rides along as the tooltip.
 */
export function auditUserLabel(user: NamecardAuditUser): string {
  return user.total > 1 ? `${user.name} (${user.total} 次)` : user.name
}

/** The weak annotation next to a name; null when the account only appears once. */
export function auditUserBadge(user: NamecardAuditUser): string | null {
  return user.total > 1 ? `(${user.total} 次)` : null
}

export function auditUserTitle(user: NamecardAuditUser): string {
  return `${user.name}：本页 ${user.pageCount} 条，累计 ${user.total} 条`
}

export function formatAuditMoment(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("zh-CN", { hour12: false })
}
