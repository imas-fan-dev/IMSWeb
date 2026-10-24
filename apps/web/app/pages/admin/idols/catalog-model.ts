import type { WikiAdminAgency, WikiAdminGroup, WikiAdminIdol } from "~/lib/api"
import { uniqueAgencyIdols } from "~/lib/wiki-admin-catalog"

export type CatalogSection = "agencies" | "groups" | "entries"

export const catalogSections = {
  agencies: {
    title: "企划管理",
    noun: "企划",
    description: "维护企划资料、公开状态与图标。",
  },
  groups: {
    title: "栏目管理",
    noun: "栏目",
    description: "按企划维护栏目资料与图标，组织内容页。",
  },
  entries: {
    title: "条目管理",
    noun: "内容页",
    description: "统一维护偶像、组合、剧情专题与其他内容页的资料。",
  },
} as const

export type CatalogRow =
  | { kind: "agency"; agency: WikiAdminAgency; entity: WikiAdminAgency }
  | { kind: "group"; agency: WikiAdminAgency; entity: WikiAdminGroup }
  | { kind: "idol"; agency: WikiAdminAgency; entity: WikiAdminIdol }

export function catalogRows(
  agencies: WikiAdminAgency[],
  section: CatalogSection
): CatalogRow[] {
  return agencies.flatMap((agency): CatalogRow[] => {
    if (section === "agencies")
      return [{ kind: "agency", agency, entity: agency }]
    if (section === "groups") {
      return agency.groups.map((entity) => ({ kind: "group", agency, entity }))
    }
    return uniqueAgencyIdols(agency).map((entity) => ({
      kind: "idol",
      agency,
      entity,
    }))
  })
}

export function rowIdentifier(row: CatalogRow) {
  return row.kind === "idol" ? row.entity.folderName : row.entity.code
}

export function rowDetails(row: CatalogRow) {
  if (row.kind === "agency") {
    return `${row.agency.groups.length} 个栏目 · ${uniqueAgencyIdols(row.agency).length} 个内容页`
  }
  if (row.kind === "group") {
    return `${new Set([...row.entity.idolIds, ...row.entity.idols.map(({ id }) => id)]).size} 个内容页`
  }
  const { entity } = row
  return (
    row.agency.groups
      .filter(
        (group) =>
          entity.groupIds.includes(group.id) ||
          group.idolIds.includes(entity.id) ||
          group.idols.some(({ id }) => id === entity.id)
      )
      .map(({ name }) => name)
      .join("、") || "未归档"
  )
}

export function storyReturnPath(value: string | null) {
  return value === "/admin/stories" || value?.startsWith("/admin/stories?")
    ? value
    : null
}
