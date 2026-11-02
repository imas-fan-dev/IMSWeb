import type { NamecardCredit } from "@imsweb/contracts/fudaba"

export const CREATOR_ROLE_LABELS: Record<NamecardCredit["roles"][number], string> = {
  design: "设计",
  illustration: "插画",
  other: "其他",
}

/** `昵称 (URL) [角色1 • 角色2]`; callers render one creator per line. */
export function formatCredit(credit: NamecardCredit): string {
  const name = credit.displayName.trim()
  const url = credit.url?.trim() ?? ""
  const roles = credit.roles.map((role) => CREATOR_ROLE_LABELS[role] ?? role)
  const head = url ? `${name} (${url})` : name
  return roles.length ? `${head} [${roles.join(" • ")}]` : head
}
