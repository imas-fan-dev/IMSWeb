import type { AdminCatalog } from "~/lib/api"

export function characterWorkspaceAddress(search: string, hash = "") {
  const params = new URLSearchParams(search)
  const agency = params.get("agencyId")
  if (!params.has("projectId") && agency && agency !== "all")
    params.set("projectId", agency)
  params.delete("agencyId")
  params.set("kind", "character")
  return `/admin/idols?${params}${hash}`
}

export function catalogWorkspaceList(
  catalog: AdminCatalog | null,
  options: {
    kind: "character" | "group"
    projectId: number | undefined
    query: string
    category: string
    includeMissing: boolean
    ownerId: string | null
    page: string | null
  }
) {
  const { kind, projectId, category, includeMissing, ownerId } = options
  const owners =
    (kind === "character" ? catalog?.characters : catalog?.groups) ?? []
  const query = options.query.trim().toLocaleLowerCase()
  const candidates = owners
    .filter(
      (owner) =>
        !owner.retired &&
        (includeMissing ||
          owner.profiles.some((p) => p.projectId === projectId)) &&
        [
          owner.name,
          ...owner.profiles.flatMap((p) => [
            p.nameCn,
            p.nameJa,
            p.nameEn,
            p.aliases,
          ]),
        ].some((name) => name?.toLocaleLowerCase().includes(query)) &&
        (kind !== "character" ||
          category === "all" ||
          owner.profiles.find((p) => p.projectId === projectId)?.category ===
            category)
    )
    .sort((a, b) =>
      kind === "character"
        ? (a.profiles.find((p) => p.projectId === projectId)?.displayOrder ??
            0) -
            (b.profiles.find((p) => p.projectId === projectId)?.displayOrder ??
              0) || a.id - b.id
        : 0
    )
  const totalPages = Math.max(1, Math.ceil(candidates.length / 20))
  const requestedPage = Number(options.page ?? 1)
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, totalPages)
      : 1
  const visible = candidates.slice((page - 1) * 20, page * 20)
  const selected = ownerId
    ? owners.find((owner) => String(owner.id) === ownerId)
    : visible[0]
  const pinned =
    selected && !visible.some((owner) => owner.id === selected.id)
      ? selected
      : null
  return {
    candidates,
    page,
    totalPages,
    pinned,
    visible: pinned ? [pinned, ...visible] : visible,
    selected,
    selectedProfile: selected?.profiles.find((p) => p.projectId === projectId),
  }
}
