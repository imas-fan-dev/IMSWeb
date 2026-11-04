import type { NamecardCredit } from "@imsweb/contracts/fudaba"

export const CREATOR_ROLE_LABELS: Record<NamecardCredit["roles"][number], string> = {
  design: "设计",
  illustration: "插画",
  other: "其他",
}

export interface CreditParts {
  name: string
  url: string | null
  /** `（设计·插画）`；挂在名字后面用弱化样式，避免和昵称里的特殊字符混读。 */
  roles: string | null
}

/** 拆成可分别渲染的片段：链接只挂在名字上，职位单独弱化。 */
export function creditParts(credit: NamecardCredit): CreditParts {
  const name = credit.displayName.trim()
  const url = credit.url?.trim() ?? ""
  const roles = credit.roles.map((role) => CREATOR_ROLE_LABELS[role] ?? role)
  return {
    name,
    url: url || null,
    roles: roles.length ? `（${roles.join("·")}）` : null,
  }
}

/** `昵称 (URL) [角色1 • 角色2]`; callers render one creator per line. */
export function formatCredit(credit: NamecardCredit): string {
  const name = credit.displayName.trim()
  const url = credit.url?.trim() ?? ""
  const roles = credit.roles.map((role) => CREATOR_ROLE_LABELS[role] ?? role)
  const head = url ? `${name} (${url})` : name
  return roles.length ? `${head} [${roles.join(" • ")}]` : head
}
