import {
  LayersIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { AdminPagination } from "~/components/admin/admin-pagination"
import { MemberChipFilter } from "~/components/admin/member-chip-filter"
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
} from "~/components/admin/admin-ui"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { UnitMemberSummary } from "~/components/shared/unit-member-summary"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  createAdminNamecardUnit,
  deleteAdminNamecardUnit,
  getAdminNamecardCharacterAgencies,
  getAdminNamecardCharacters,
  getAdminNamecardUnits,
  isApiError,
  updateAdminNamecardUnit,
  type NamecardCharacter,
  type NamecardCharacterAgency,
  type NamecardCharacterCategory,
  type NamecardUnit,
  type NamecardUnitList,
} from "~/lib/api"
import { useNamecardCharacterCatalog } from "~/lib/use-namecard-character-catalog"
import { UnitEditorDialog } from "./unit-editor-dialog"
import {
  NAMECARD_UNIT_CONFLICT_MESSAGE,
  buildUnitCreateInput,
  buildUnitUpdateInput,
  emptyUnitDraft,
  unitDraftFrom,
  type UnitDraft,
  type UnitMemberOption,
} from "./namecard-unit-model"

const EMPTY_PAGE_INFO: NamecardUnitList["pageInfo"] = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
}

const ALL_VALUE = "all"

export function meta() {
  return [{ title: "组合列表 | IMSWeb" }]
}

export default function AdminCardsUnitsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryParam = searchParams.get("query") ?? ""
  const agencyIdParam = searchParams.get("agencyId") ?? ALL_VALUE
  const requestedPage = Number(searchParams.get("page") ?? "1")
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  const memberIdsParam = searchParams.get("memberIds") ?? ""
  const selectedMemberIds = useMemo(
    () =>
      memberIdsParam
        .split(",")
        .map((part) => Number(part))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    [memberIdsParam]
  )

  const [draftQuery, setDraftQuery] = useState(queryParam)
  // The applied keyword drives the request. It only reaches the URL through
  // `commitQuery`, so typing pauses do not run a router transition.
  const [appliedQuery, setAppliedQuery] = useState(queryParam)
  const queryTimer = useRef<number | undefined>(undefined)
  const [draftAgency, setDraftAgency] = useState(agencyIdParam)

  // Clearing a search should land back on the page the operator was browsing,
  // not jump to the first page; remember it while no search is active.
  const browsingPage = useRef(1)
  useEffect(() => {
    if (!appliedQuery && memberIdsParam === "") browsingPage.current = page
  }, [page, appliedQuery, memberIdsParam])

  const [units, setUnits] = useState<NamecardUnit[]>([])
  const [pageInfo, setPageInfo] =
    useState<NamecardUnitList["pageInfo"]>(EMPTY_PAGE_INFO)
  const [agencies, setAgencies] = useState<NamecardCharacterAgency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTarget, setEditorTarget] = useState<NamecardUnit | null>(null)
  const [editorDraft, setEditorDraft] = useState<UnitDraft>(emptyUnitDraft())
  const [editorMembers, setEditorMembers] = useState<
    NamecardCharacter[] | null
  >(null)
  const [editorMemberIndex, setEditorMemberIndex] = useState<
    Map<number, UnitMemberOption>
  >(() => new Map())
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<NamecardUnit | null>(null)
  const [deleting, setDeleting] = useState(false)

  const applyResult = useCallback((result: NamecardUnitList) => {
    setUnits(result.units)
    setPageInfo(result.pageInfo)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      applyResult(
        await getAdminNamecardUnits({
          query: appliedQuery || undefined,
          memberIds:
            selectedMemberIds.length > 0 ? selectedMemberIds : undefined,
          agencyId:
            agencyIdParam === ALL_VALUE ? undefined : Number(agencyIdParam),
          page,
        }).send()
      )
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [applyResult, agencyIdParam, selectedMemberIds, page, appliedQuery])

  useEffect(() => {
    let active = true
    getAdminNamecardUnits({
      query: appliedQuery || undefined,
      memberIds: selectedMemberIds.length > 0 ? selectedMemberIds : undefined,
      agencyId: agencyIdParam === ALL_VALUE ? undefined : Number(agencyIdParam),
      page,
    })
      .send()
      .then((result) => {
        if (!active) return
        setError(false)
        applyResult(result)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [applyResult, agencyIdParam, appliedQuery, selectedMemberIds, page])

  // A narrower query can leave the list past its last page, which renders as an empty table
  // even though the search has hits. Pull the paging back inside the result set: a search
  // restarts at the first page, a shrunken unfiltered list lands on its last page.
  useEffect(() => {
    const lastPage = Math.max(1, pageInfo.totalPages)
    if (pageInfo.page <= lastPage) return
    const target = appliedQuery || selectedMemberIds.length > 0 ? 1 : lastPage
    if (Math.max(1, page) === target) return
    const next = new URLSearchParams(searchParams)
    if (target <= 1) next.delete("page")
    else next.set("page", String(target))
    setSearchParams(next, { replace: true })
  }, [
    appliedQuery,
    page,
    pageInfo,
    searchParams,
    selectedMemberIds,
    setSearchParams,
  ])

  useEffect(() => {
    let active = true
    getAdminNamecardCharacterAgencies()
      .send()
      .then((result) => {
        if (active) setAgencies(result.agencies)
      })
      .catch(() => {
        if (active) toast.error("企划列表加载失败，请稍后重试。")
      })
    return () => {
      active = false
    }
  }, [])

  /** Re-applies the remembered browsing page to a fresh param set. */
  function restorePage(next: URLSearchParams) {
    if (browsingPage.current > 1) next.set("page", String(browsingPage.current))
    else next.delete("page")
  }

  // The catalog doubles as the label source for the member chips, so a shared
  // request serves the filter and the editor's picker alike.
  const { catalog } = useNamecardCharacterCatalog()
  const memberChips = useMemo(() => {
    const names = new Map<number, string>()
    for (const entry of catalog?.characters ?? [])
      names.set(entry.id, entry.nameCn)
    return selectedMemberIds.map((id) => ({
      id,
      nameCn: names.get(id) ?? `#${id}`,
    }))
  }, [catalog, selectedMemberIds])

  /** Records a committed keyword in the URL (share/refresh), without a re-query. */
  function writeQueryParam(next: string) {
    const params = new URLSearchParams(searchParams)
    if (next) {
      params.set("query", next)
      params.delete("page")
    } else {
      params.delete("query")
      restorePage(params)
    }
    setSearchParams(params, { replace: true })
  }

  /** Debounces typing into the applied keyword; never touches the URL. */
  function scheduleQuery(next: string) {
    window.clearTimeout(queryTimer.current)
    queryTimer.current = window.setTimeout(
      () => setAppliedQuery(next.trim()),
      300
    )
  }

  /** Replaces the member filter; an empty list clears it and restores the page. */
  function setMemberFilter(ids: number[]) {
    const next = new URLSearchParams(searchParams)
    if (ids.length > 0) {
      next.set("memberIds", ids.join(","))
      next.delete("page")
    } else {
      next.delete("memberIds")
      restorePage(next)
    }
    setSearchParams(next)
  }

  /** Enter flushes the keyword immediately and records it in the URL. */
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    window.clearTimeout(queryTimer.current)
    const trimmed = draftQuery.trim()
    setAppliedQuery(trimmed)
    writeQueryParam(trimmed)
  }

  function selectAgency(value: string) {
    setDraftAgency(value)
    const next = new URLSearchParams(searchParams)
    if (value === ALL_VALUE) next.delete("agencyId")
    else next.set("agencyId", value)
    next.delete("page")
    setSearchParams(next)
  }

  /** Clears only the keyword; the member/agency filters stay put. */
  function clearKeyword() {
    window.clearTimeout(queryTimer.current)
    setDraftQuery("")
    setAppliedQuery("")
    writeQueryParam("")
  }

  function clearSearch() {
    window.clearTimeout(queryTimer.current)
    setAppliedQuery("")
    setDraftQuery("")
    setDraftAgency(ALL_VALUE)
    // Clearing the whole filter form starts a fresh browse, so it drops the
    // remembered page instead of restoring it.
    setSearchParams(new URLSearchParams())
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete("page")
    else next.set("page", String(nextPage))
    setSearchParams(next)
  }

  /**
   * Grows the label lookup instead of replacing it, so a checked member stays
   * resolvable after a later search narrows the visible candidates to others.
   */
  const rememberMembers = useCallback((members: UnitMemberOption[]) => {
    setEditorMemberIndex((previous) => {
      const next = new Map(previous)
      let added = false
      for (const member of members) {
        if (next.has(member.id)) continue
        next.set(member.id, member)
        added = true
      }
      return added ? next : previous
    })
  }, [])

  const loadEditorMembers = useCallback(
    async (
      query: string,
      agencyId: number | null,
      category: NamecardCharacterCategory | null
    ) => {
      try {
        const result = await getAdminNamecardCharacters({
          query: query || undefined,
          agencyId: agencyId ?? undefined,
          category: category ?? undefined,
          pageSize: 100,
        }).send()
        setEditorMembers(result.characters)
        rememberMembers(
          result.characters.map((character) => ({
            id: character.id,
            nameCn: character.nameCn,
            nameJa: character.nameJa,
            nameEn: character.nameEn,
          }))
        )
      } catch {
        setEditorMembers([])
        toast.error("角色候选加载失败，请稍后重试。")
      }
    },
    [rememberMembers]
  )

  /** Stable so the dialog's debounced search effect does not re-fire per render. */
  const searchEditorMembers = useCallback(
    (
      query: string,
      agencyId: number | null,
      category: NamecardCharacterCategory | null
    ) => void loadEditorMembers(query, agencyId, category),
    [loadEditorMembers]
  )

  function openCreate() {
    setEditorTarget(null)
    setEditorDraft(emptyUnitDraft())
    setEditorMembers(null)
    searchEditorMembers("", null, null)
    setEditorOpen(true)
  }

  function openEdit(unit: NamecardUnit) {
    setEditorTarget(unit)
    setEditorDraft(unitDraftFrom(unit))
    rememberMembers(
      unit.members.map((member) => ({
        id: member.characterId,
        nameCn: member.nameCn,
        nameJa: member.nameJa,
        nameEn: member.nameEn,
      }))
    )
    setEditorMembers(null)
    searchEditorMembers("", null, null)
    setEditorOpen(true)
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      if (editorTarget) {
        await updateAdminNamecardUnit(
          editorTarget.id,
          buildUnitUpdateInput(editorDraft, editorTarget.revision)
        ).send()
        toast.success("组合已更新")
      } else {
        await createAdminNamecardUnit(buildUnitCreateInput(editorDraft)).send()
        toast.success("组合已新增")
      }
      setEditorOpen(false)
      await refresh()
    } catch (submitError) {
      if (
        isApiError(submitError) &&
        submitError.code === "NAMECARD_UNIT_STATE_CONFLICT"
      ) {
        toast.error(NAMECARD_UNIT_CONFLICT_MESSAGE)
        setEditorOpen(false)
        await refresh()
      } else if (
        isApiError(submitError) &&
        (submitError.status === 400 || submitError.status === 409)
      ) {
        toast.error(submitError.message || "保存失败，请检查名称是否重复。")
      } else {
        toast.error(adminErrorMessage(submitError))
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteAdminNamecardUnit(
        deleteTarget.id,
        deleteTarget.revision
      ).send()
      toast.success(`「${deleteTarget.nameCn}」已删除`)
      setDeleteTarget(null)
      await refresh()
    } catch (deleteError) {
      if (
        isApiError(deleteError) &&
        deleteError.code === "NAMECARD_UNIT_STATE_CONFLICT"
      ) {
        toast.error(NAMECARD_UNIT_CONFLICT_MESSAGE)
        setDeleteTarget(null)
        await refresh()
      } else {
        toast.error(adminErrorMessage(deleteError))
      }
    } finally {
      setDeleting(false)
    }
  }

  const agencyItems = [
    { value: ALL_VALUE, label: "全部企划" },
    ...agencies.map((agency) => ({
      value: String(agency.id),
      label: agency.name,
    })),
  ]

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <AdminPageHeader
        eyebrow="NAMECARD UNITS"
        title="组合列表"
        description="维护名片组合候选：名称、所属企划与成员。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              刷新
            </Button>
            <Button type="button" disabled={saving} onClick={openCreate}>
              <PlusIcon data-icon="inline-start" />
              新增组合
            </Button>
          </div>
        }
      />

      <form
        className="flex flex-col gap-3 lg:flex-row lg:items-end"
        onSubmit={submitSearch}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">关键字</span>
          <div className="relative">
            <Input
              value={draftQuery}
              placeholder="搜索中文名 / 日文名 / 英文名 / 别名"
              className={
                draftQuery ? adminControlClass + " pr-9" : adminControlClass
              }
              disabled={loading}
              onChange={(event) => {
                setDraftQuery(event.target.value)
                scheduleQuery(event.target.value)
              }}
            />
            {draftQuery ? (
              <button
                type="button"
                aria-label="清除关键字"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={clearKeyword}
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </div>
        </label>
        <label
          className="flex min-w-0 flex-1 flex-col gap-1.5"
          htmlFor="namecard-unit-member-filter"
        >
          <span className="text-sm font-medium">成员</span>
          <MemberChipFilter
            id="namecard-unit-member-filter"
            selected={memberChips}
            characters={catalog?.characters ?? []}
            disabled={loading}
            onChange={setMemberFilter}
          />
        </label>
        <label className="flex flex-col gap-1.5 lg:w-56">
          <span className="text-sm font-medium">企划</span>
          <Select
            items={agencyItems}
            value={draftAgency}
            disabled={loading}
            onValueChange={(value) => selectAgency(String(value))}
          >
            <SelectTrigger className={`${adminControlClass} w-full`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {agencyItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={clearSearch}
          >
            清空
          </Button>
        </div>
      </form>

      <AdminPanel
        title="组合目录"
        description={`共 ${pageInfo.total} 条记录，第 ${pageInfo.page} 页`}
        icon={LayersIcon}
      >
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>无法读取组合列表</AlertTitle>
            <AlertDescription>请确认管理会话有效，然后重试。</AlertDescription>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
              >
                重试
              </Button>
            </div>
          </Alert>
        ) : units.length === 0 ? (
          <AdminEmptyState
            icon={LayersIcon}
            title="暂无组合条目"
            description="调整筛选条件，或新增一个组合条目。"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>中文名</TableHead>
                  <TableHead>日文名</TableHead>
                  <TableHead>英文名</TableHead>
                  <TableHead>所属企划</TableHead>
                  <TableHead>成员</TableHead>
                  <TableHead>排序值</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => {
                  return (
                    <TableRow key={unit.id}>
                      <TableCell
                        className="max-w-44 truncate font-medium"
                        title={unit.nameCn}
                      >
                        {unit.nameCn}
                      </TableCell>
                      <TableCell
                        className="max-w-44 truncate"
                        title={unit.nameJa ?? undefined}
                      >
                        {unit.nameJa ?? "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-44 truncate"
                        title={unit.nameEn ?? undefined}
                      >
                        {unit.nameEn ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-36 whitespace-nowrap">
                        {unit.agencies.length === 0 ? (
                          "—"
                        ) : unit.agencies.length > 2 ? (
                          // Three or more agencies will not fit as named badges,
                          // so the cell keeps one badge that carries the colours
                          // only; the names move to the dot titles.
                          <Badge
                            variant="secondary"
                            className="gap-1.5"
                            aria-label={unit.agencies
                              .map((agency) => agency.name)
                              .join("、")}
                          >
                            {unit.agencies.map((agency) => (
                              <span
                                key={agency.id}
                                className="size-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: agency.color }}
                                title={agency.name}
                              />
                            ))}
                          </Badge>
                        ) : (
                          <span className="flex flex-nowrap gap-1">
                            {unit.agencies.map((agency) => (
                              <Badge
                                key={agency.id}
                                variant="secondary"
                                className="gap-1.5"
                              >
                                <span
                                  className="size-2.5 rounded-sm border"
                                  style={{ backgroundColor: agency.color }}
                                  aria-hidden="true"
                                />
                                {agency.name}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {unit.members.length === 0 ? (
                          "—"
                        ) : (
                          <div className="max-w-40">
                            <UnitMemberSummary
                              className="text-sm"
                              names={unit.members.map(
                                (member) => member.nameCn
                              )}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {unit.displayOrder}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex flex-nowrap justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving || deleting}
                            onClick={() => openEdit(unit)}
                          >
                            <PencilIcon data-icon="inline-start" />
                            编辑
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={saving || deleting}
                            onClick={() => setDeleteTarget(unit)}
                          >
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <AdminPagination
          page={pageInfo.page}
          totalPages={pageInfo.totalPages}
          disabled={loading}
          onChange={changePage}
        />
      </AdminPanel>

      <UnitEditorDialog
        open={editorOpen}
        editing={editorTarget !== null}
        agencies={agencies}
        draft={editorDraft}
        saving={saving}
        memberCandidates={editorMembers}
        memberIndex={editorMemberIndex}
        onChange={setEditorDraft}
        onMemberSearch={searchEditorMembers}
        onOpenChange={setEditorOpen}
        onCancel={() => setEditorOpen(false)}
        onSubmit={submitEditor}
      />

      <ConfirmActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
        title="删除组合"
        description={
          deleteTarget
            ? `「${deleteTarget.nameCn}」将从名片组合候选中移除。此操作不可撤销。`
            : ""
        }
        submitting={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
