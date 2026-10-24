import { useRequest } from "alova/client"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  UsersRoundIcon,
} from "lucide-react"
import { useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
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
import {
  WikiEntryKindBadge,
  wikiEntryKindOptions,
} from "~/components/wiki/wiki-entry-kind"
import { getAdminWikiCatalog, isApiError } from "~/lib/api"
import { useNavigation } from "~/lib/navigation/use-navigation"
import {
  catalogRows,
  catalogSections,
  rowDetails,
  rowIdentifier,
  storyReturnPath,
  type CatalogSection,
} from "../catalog-model"
import {
  WikiEntityEditorDialog,
  type WikiEntityEditorTarget,
} from "./wiki-entity-editor-dialog"
import {
  WikiEntryCreateDialog,
  type WikiEntryCreated,
} from "./wiki-entry-create-dialog"

const PAGE_SIZE = 20

export function CatalogManager({ section }: { section: CatalogSection }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigation()
  const [target, setTarget] = useState<WikiEntityEditorTarget | null>(null)
  const [creatingEntry, setCreatingEntry] = useState(false)
  const createButton = useRef<HTMLButtonElement>(null)
  const { data, loading, error, send, onError } = useRequest(
    getAdminWikiCatalog(),
    {
      initialData: { status: "success" as const, agencies: [] },
    }
  )
  onError(() => undefined)
  const { title, noun, description } = catalogSections[section]
  const agencyId = params.get("agencyId") ?? "all"
  const entryKind = params.get("type") ?? "all"
  const query = params.get("query") ?? ""
  const idolId = section === "entries" ? params.get("idolId") : null
  const returnTo = storyReturnPath(params.get("returnTo"))
  const agency = data.agencies.find(({ id }) => String(id) === agencyId)
  const rows = catalogRows(data.agencies, section).filter((row) => {
    if (agencyId !== "all" && String(row.agency.id) !== agencyId) return false
    if (
      row.kind === "idol" &&
      entryKind !== "all" &&
      row.entity.entryKind !== entryKind
    )
      return false
    if (idolId && String(row.entity.id) !== idolId) return false
    const text =
      `${row.entity.name} ${rowIdentifier(row)} ${row.entity.id} ${row.agency.name}`.toLocaleLowerCase()
    return text.includes(query.trim().toLocaleLowerCase())
  })
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const requestedPage = Number(params.get("page") ?? "1")
  const page = Math.min(
    totalPages,
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  )
  const visibleRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const canCreate =
    section === "entries" ||
    (!loading && !error && (section === "agencies" || Boolean(agency)))

  function setFilter(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value && value !== "all") next.set(key, value)
        else next.delete(key)
        if (key !== "page") next.delete("page")
        if (key === "agencyId" || key === "type") next.delete("idolId")
        return next
      },
      { preventScrollReset: true, replace: key === "query" }
    )
  }

  function createEntity() {
    if (section === "entries") setCreatingEntry(true)
    else if (section === "agencies") setTarget({ kind: "agency", entity: null })
    else if (agency)
      setTarget({
        kind: "group",
        agency,
        entity: null,
      })
  }

  function refresh() {
    void send().catch(() => undefined)
  }

  function entryCreated({ idol, imageError }: WikiEntryCreated) {
    setCreatingEntry(false)
    refresh()
    // A toast may outlive this page. Its link targets the entry explicitly,
    // retaining the return context from the creation session.
    const next = new URLSearchParams(params)
    for (const key of ["query", "type", "page"]) next.delete(key)
    next.set("agencyId", String(idol.agencyId))
    next.set("idolId", String(idol.id))
    const action = {
      label: "查看条目",
      onClick: () =>
        navigate(`/admin/idols/entries?${next}`, { preventScrollReset: true }),
    }
    if (imageError)
      toast.error(
        `“${idol.name}”已创建，但头像未保存：${imageError}。可查看条目后编辑头像。`,
        { action, duration: 10000 }
      )
    else toast.success(`“${idol.name}”已创建`, { action })
  }

  const agencyOptions = [
    { value: "all", label: "全部企划" },
    ...data.agencies.map(({ id, name }) => ({
      value: String(id),
      label: name,
    })),
  ]
  const typeOptions = [
    { value: "all", label: "全部类型" },
    ...wikiEntryKindOptions.map(({ value, label }) => ({ value, label })),
  ]

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminPageHeader
        eyebrow="IDOL MANAGEMENT"
        title={title}
        description={description}
        actions={
          <>
            {returnTo ? (
              <NavigationLink
                to={returnTo}
                className={buttonVariants({ variant: "outline" })}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                返回剧情内容
              </NavigationLink>
            ) : null}
            <Button variant="outline" disabled={loading} onClick={refresh}>
              <RefreshCwIcon data-icon="inline-start" />
              刷新
            </Button>
            <Button
              ref={createButton}
              disabled={!canCreate}
              onClick={createEntity}
            >
              <PlusIcon data-icon="inline-start" />
              新增{noun}
            </Button>
          </>
        }
      />
      {error ? (
        <Alert role="alert">
          <AlertTitle>目录加载失败</AlertTitle>
          <AlertDescription>
            {isApiError(error) ? error.message : "请求失败，请刷新后重试。"}
          </AlertDescription>
        </Alert>
      ) : null}
      <AdminPanel
        title={`${noun}列表`}
        description={
          section === "groups" && !agency
            ? "新增栏目前，请先选择所属企划。"
            : `共 ${rows.length} 项`
        }
        contentClassName="flex min-w-0 flex-col gap-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="catalog-query">搜索{noun}</FieldLabel>
            <Input
              id="catalog-query"
              value={query}
              placeholder="名称、标识或 ID"
              onChange={(event) => setFilter("query", event.target.value)}
            />
          </Field>
          {section !== "agencies" ? (
            <Field>
              <FieldLabel htmlFor="catalog-agency">所属企划</FieldLabel>
              <Select
                items={agencyOptions}
                value={agencyId}
                onValueChange={(value) =>
                  setFilter("agencyId", String(value ?? "all"))
                }
              >
                <SelectTrigger id="catalog-agency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agencyOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {section === "entries" ? (
            <Field>
              <FieldLabel htmlFor="catalog-type">类型</FieldLabel>
              <Select
                items={typeOptions}
                value={entryKind}
                onValueChange={(value) =>
                  setFilter("type", String(value ?? "all"))
                }
              >
                <SelectTrigger id="catalog-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
        {idolId ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            当前定位：ID {idolId}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilter("idolId", "")}
            >
              清除定位
            </Button>
          </div>
        ) : null}
        {loading ? (
          <div
            role="status"
            aria-label="正在加载目录"
            className="flex flex-col gap-3"
          >
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-14 w-full" />
            ))}
          </div>
        ) : visibleRows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  {section !== "agencies" ? <TableHead>企划</TableHead> : null}
                  <TableHead>
                    {section === "entries" ? "类型 / 栏目" : "内容"}
                  </TableHead>
                  <TableHead>公开状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => {
                  const imageUrl =
                    row.kind === "idol"
                      ? row.entity.imageUrl
                      : row.entity.iconUrl
                  return (
                    <TableRow key={`${row.kind}-${row.entity.id}`}>
                      <TableCell>
                        <div className="flex min-w-48 items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                            {imageUrl ? (
                              <WikiTransformedImage
                                src={imageUrl}
                                alt=""
                                transform={row.entity.imageTransform}
                              />
                            ) : (
                              <UsersRoundIcon
                                className="size-4 text-muted-foreground"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium">{row.entity.name}</p>
                            <p className="text-xs text-muted-foreground">
                              ID {row.entity.id} · {rowIdentifier(row)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      {section !== "agencies" ? (
                        <TableCell>{row.agency.name}</TableCell>
                      ) : null}
                      <TableCell>
                        <div className="flex max-w-64 flex-col items-start gap-1">
                          {row.kind === "idol" ? (
                            <WikiEntryKindBadge
                              kind={row.entity.entryKind}
                              subtype={row.entity.entrySubtype}
                            />
                          ) : null}
                          <span className="text-xs whitespace-normal text-muted-foreground">
                            {rowDetails(row)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.kind === "group" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge
                            variant={
                              row.entity.wikiEnabled ? "secondary" : "outline"
                            }
                          >
                            {row.entity.wikiEnabled ? "公开显示" : "暂不公开"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={Boolean(error)}
                            aria-label={`编辑${noun} ${row.entity.name}`}
                            onClick={() => setTarget(row)}
                          >
                            <PencilIcon data-icon="inline-start" />
                            编辑
                          </Button>
                          {row.kind === "idol" ? (
                            <NavigationLink
                              to={`/admin/stories?agencyId=${row.agency.id}&idolId=${row.entity.id}`}
                              className={buttonVariants({
                                variant: "ghost",
                                size: "sm",
                              })}
                              aria-label={`管理剧情 ${row.entity.name}`}
                            >
                              剧情
                            </NavigationLink>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                共 {rows.length} 项 · 第 {page} / {totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setFilter("page", String(page - 1))}
                >
                  <ArrowLeftIcon data-icon="inline-start" />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setFilter("page", String(page + 1))}
                >
                  下一页
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </>
        ) : !error ? (
          <AdminEmptyState
            icon={UsersRoundIcon}
            title={`没有匹配的${noun}`}
            description="可调整筛选条件，或使用上方新增按钮建立资料。"
          />
        ) : null}
        {!loading &&
        !error &&
        section !== "agencies" &&
        !data.agencies.length ? (
          <NavigationLink
            to="/admin/idols/agencies"
            className={buttonVariants({ variant: "outline" })}
          >
            前往企划管理
          </NavigationLink>
        ) : null}
      </AdminPanel>
      <WikiEntityEditorDialog
        target={target}
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
        onSaved={refresh}
      />
      {creatingEntry ? (
        <WikiEntryCreateDialog
          agencies={data.agencies}
          initialAgencyId={
            Number.isSafeInteger(Number(agencyId)) && Number(agencyId) > 0
              ? Number(agencyId)
              : undefined
          }
          loading={loading}
          catalogError={error}
          onRetry={refresh}
          onClose={() => setCreatingEntry(false)}
          onCreated={entryCreated}
          returnFocus={createButton}
        />
      ) : null}
    </div>
  )
}
