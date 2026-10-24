import type { WikiAdminAgency, WikiAdminIdol } from "~/lib/api"

export function uniqueAgencyIdols(agency?: WikiAdminAgency) {
  if (!agency) return []
  const idolsById = new Map<number, WikiAdminIdol>()
  for (const idol of agency.idols) idolsById.set(idol.id, idol)
  for (const group of agency.groups) {
    for (const idol of group.idols) {
      if (!idolsById.has(idol.id)) idolsById.set(idol.id, idol)
    }
  }
  return [...idolsById.values()].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.id - right.id
  )
}
