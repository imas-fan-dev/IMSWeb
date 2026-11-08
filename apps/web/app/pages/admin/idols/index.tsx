import { PlusIcon, RefreshCwIcon } from "lucide-react"
import { startTransition, useCallback, useEffect, useState } from "react"
import {
  Navigate,
  useLocation,
  useOutletContext,
  useSearchParams,
} from "react-router"

import {
  CatalogProfileEditor,
  catalogCategoryLabels,
} from "~/components/admin/catalog-profiles-dialog"
import { AdminPagination } from "~/components/admin/admin-pagination"
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { Button, buttonVariants } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  getAdminCatalog,
  NAMECARD_CHARACTER_CATEGORIES,
  type AdminCatalog,
  type AdminSession,
} from "~/lib/api"
import {
  catalogWorkspaceList,
  characterWorkspaceAddress,
} from "./catalog-workspace-model"
import { CatalogCharacterRetireButton } from "./components/catalog-character-retire-button"

export function meta() {
  return [{ title: "角色档案 | IMSWeb" }]
}

export default function AdminIdolsPage() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  if (["idolId", "returnTo", "type"].some((key) => params.has(key))) {
    return (
      <Navigate
        to={`/admin/idols/entries${location.search}${location.hash}`}
        replace
      />
    )
  }
  if (params.has("agencyId"))
    return (
      <Navigate
        to={characterWorkspaceAddress(location.search, location.hash)}
        replace
      />
    )
  return <CatalogWorkspace />
}

function CatalogWorkspace() {
  const context = useOutletContext<{ adminSession: AdminSession } | null>()
  const canWrite = context?.adminSession.dept === "op"
  const [params, setParams] = useSearchParams()
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const kind = params.get("kind") === "group" ? "group" : "character"
  const query = params.get("query") ?? ""
  const category = params.get("category") ?? "all"
  const includeMissing = params.get("includeMissing") === "1"
  const project = params.has("projectId")
    ? catalog?.projects.find((p) => String(p.id) === params.get("projectId"))
    : catalog?.projects[0]
  const {
    candidates,
    visible,
    page,
    totalPages,
    pinned,
    selected,
    selectedProfile,
  } = catalogWorkspaceList(catalog, {
    kind,
    projectId: project?.id,
    query,
    category,
    includeMissing,
    ownerId: params.get("ownerId"),
    page: params.get("page"),
  })
  const selectedCharacter =
    kind === "character"
      ? catalog?.characters.find((owner) => owner.id === selected?.id)
      : null

  function filter(key: string, value: string) {
    setCreating(false)
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        if (key === "projectId" && selected)
          next.set("ownerId", String(selected.id))
        else if (key !== "ownerId") next.delete("ownerId")
        if (key !== "ownerId" && key !== "page") next.delete("page")
        return next
      },
      { replace: key === "query", preventScrollReset: true }
    )
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCatalog(await getAdminCatalog().send())
    } catch (cause) {
      setError(adminErrorMessage(cause) ?? "无法读取角色档案")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    let active = true
    void getAdminCatalog()
      .send()
      .then((data) => {
        if (active) setCatalog(data)
      })
      .catch((cause) => {
        if (active) setError(adminErrorMessage(cause) ?? "无法读取角色档案")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="IDOL CATALOG"
        title="角色档案"
        description="角色列表与企划档案在此统一维护。选择企划和角色，直接编辑完整资料及名片默认档案。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={loading || busy}
              onClick={() => void load()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              刷新资料库
            </Button>
            {canWrite ? (
              <>
                {kind === "character" ? (
                  <Button
                    disabled={busy || loading || !project}
                    onClick={() => setCreating(true)}
                  >
                    <PlusIcon data-icon="inline-start" />
                    新建人物档案
                  </Button>
                ) : null}
                <NavigationLink
                  to="/admin/idols/units"
                  className={buttonVariants({ variant: "outline" })}
                >
                  组合身份管理
                </NavigationLink>
              </>
            ) : null}
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="catalog-workspace-project">当前企划</FieldLabel>
          <Select
            items={
              catalog?.projects.map((p) => ({
                value: String(p.id),
                label: p.name,
              })) ?? []
            }
            value={project ? String(project.id) : null}
            disabled={loading || busy || !catalog?.projects.length}
            onValueChange={(value) => filter("projectId", value ?? "")}
          >
            <SelectTrigger id="catalog-workspace-project" className="w-full">
              <SelectValue placeholder="选择企划" />
            </SelectTrigger>
            <SelectContent>
              {catalog?.projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div
          role="group"
          aria-label="资料类型"
          className="flex items-end gap-1"
        >
          <Button
            variant={kind === "character" ? "secondary" : "ghost"}
            aria-pressed={kind === "character"}
            disabled={busy}
            onClick={() => filter("kind", "character")}
          >
            人物
          </Button>
          <Button
            variant={kind === "group" ? "secondary" : "ghost"}
            aria-pressed={kind === "group"}
            disabled={busy}
            onClick={() => filter("kind", "group")}
          >
            组合与分组
          </Button>
        </div>
        {kind === "character" ? (
          <Field>
            <FieldLabel htmlFor="catalog-workspace-category">
              角色分类筛选
            </FieldLabel>
            <Select
              items={[
                { value: "all", label: "全部分类" },
                ...NAMECARD_CHARACTER_CATEGORIES.map((value) => ({
                  value,
                  label: catalogCategoryLabels[value],
                })),
              ]}
              value={category}
              disabled={busy}
              onValueChange={(value) => filter("category", value ?? "all")}
            >
              <SelectTrigger id="catalog-workspace-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {NAMECARD_CHARACTER_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {catalogCategoryLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="catalog-workspace-search">搜索资料</FieldLabel>
          <Input
            id="catalog-workspace-search"
            value={query}
            disabled={busy}
            placeholder="中文名、日文名、英文名或别名"
            onChange={(event) => filter("query", event.target.value)}
          />
        </Field>
      </div>
      {loading ? (
        <p role="status">正在加载角色档案…</p>
      ) : error ? (
        <div role="alert" className="space-y-3">
          <p>{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            重试加载资料库
          </Button>
        </div>
      ) : catalog && project ? (
        <>
          {canWrite ? (
            <div className="flex flex-wrap items-center gap-3">
              <Checkbox
                id="catalog-workspace-missing"
                checked={includeMissing}
                disabled={busy}
                onCheckedChange={(checked) =>
                  filter("includeMissing", checked ? "1" : "")
                }
              />
              <label htmlFor="catalog-workspace-missing" className="text-sm">
                包括尚未建立此企划档案的对象
              </label>
              <span className="text-sm text-muted-foreground">
                选中现有人物或组合即可新增该企划档案，身份保持不变。
              </span>
            </div>
          ) : null}
          <div className="grid items-start gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <AdminPanel
              title={`${project.name} · ${kind === "character" ? "人物" : "组合与分组"}（${candidates.length}）`}
              className="min-w-0 overflow-hidden"
              contentClassName="p-0"
            >
              {visible.length ? (
                <div className="max-h-64 overflow-y-auto xl:max-h-[70vh]">
                  {visible.map((owner) => {
                    const profile = owner.profiles.find(
                      (p) => p.projectId === project.id
                    )
                    return (
                      <button
                        key={owner.id}
                        type="button"
                        disabled={busy}
                        aria-pressed={!creating && owner.id === selected?.id}
                        className="block w-full border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-muted disabled:opacity-50 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                        onClick={() => filter("ownerId", String(owner.id))}
                      >
                        <span className="block font-medium">
                          {profile?.nameCn ?? owner.name}
                          {profile?.isFallback ? "（通用兜底）" : ""}
                          {owner.retired ? "（已停用）" : ""}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          ID {owner.id}
                          {profile?.category
                            ? ` · ${catalogCategoryLabels[profile.category]} · 排序 ${profile.displayOrder}`
                            : ""}
                          {pinned?.id === owner.id ? " · 当前选中项" : ""}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {profile ? owner.name : "尚无当前企划档案"} ·{" "}
                          {owner.profiles
                            .map(
                              (p) =>
                                catalog.projects.find(
                                  (project) => project.id === p.projectId
                                )?.name
                            )
                            .filter(Boolean)
                            .join(" / ")}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="p-4 text-sm text-muted-foreground">
                  没有符合条件的资料。
                </div>
              )}
              <div className="px-4 pb-4">
                <AdminPagination
                  page={page}
                  totalPages={totalPages}
                  disabled={busy}
                  onChange={(value) => filter("page", String(value))}
                />
              </div>
            </AdminPanel>
            {creating ? (
              <AdminPanel
                title={`新建人物档案 · ${project.name}`}
                description="填写完整企划资料，同时建立稳定身份和默认档案。"
                contentClassName="p-4 sm:p-6"
              >
                <CatalogProfileEditor
                  key={`create/${project.id}`}
                  kind="character"
                  ownerId={0}
                  creating
                  initialProjectId={project.id}
                  initialCatalog={catalog}
                  fixedProject
                  presentation="panel"
                  onBusyChange={setBusy}
                  onCreated={(data, ownerId) => {
                    startTransition(() => {
                      setCatalog(data)
                      setParams(
                        {
                          kind: "character",
                          projectId: String(project.id),
                          ownerId: String(ownerId),
                        },
                        { preventScrollReset: true }
                      )
                      setCreating(false)
                    })
                  }}
                />
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setCreating(false)}
                >
                  取消新建
                </Button>
              </AdminPanel>
            ) : selected ? (
              <AdminPanel
                title={`${selectedProfile?.nameCn ?? selected.name} · ${project.name}`}
                description={`${selectedProfile ? "完整企划档案" : "当前企划尚无档案"} · ${kind === "character" ? "人物" : "组合"} ID ${selected.id}${selected.retired ? " · 已停用，仅供查看" : ""}`}
                className="min-w-0"
                contentClassName="p-4 sm:p-6"
              >
                <CatalogProfileEditor
                  key={`${kind}/${selected.id}/${project.id}`}
                  kind={kind}
                  ownerId={selected.id}
                  initialProjectId={project.id}
                  initialCatalog={catalog}
                  fixedProject
                  presentation="panel"
                  readOnly={!canWrite || selected.retired}
                  onBusyChange={setBusy}
                  onSaved={(data) => {
                    setCatalog(data)
                    filter("ownerId", String(selected.id))
                  }}
                />
                {canWrite && selectedCharacter && !selectedCharacter.retired ? (
                  <div className="mt-6 border-t pt-4">
                    <CatalogCharacterRetireButton
                      key={selectedCharacter.id}
                      owner={selectedCharacter}
                      disabled={busy}
                      onBusyChange={setBusy}
                      onRetired={async () => {
                        filter("ownerId", String(selectedCharacter.id))
                        await load()
                      }}
                    />
                  </div>
                ) : null}
              </AdminPanel>
            ) : (
              <AdminEmptyState
                icon={PlusIcon}
                title={
                  params.has("ownerId")
                    ? "找不到指定人物或组合"
                    : "尚无可显示的档案"
                }
                description={
                  params.has("ownerId")
                    ? "请检查链接中的身份 ID，或从列表重新选择。"
                    : canWrite
                      ? "可直接新建人物档案，或包括其他企划的现有人物来建立此企划档案。"
                      : "当前企划暂无符合条件的档案。"
                }
              />
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {catalog?.projects.length
            ? "找不到指定企划，请从上方重新选择。"
            : "请先建立企划，再维护人物与组合档案。"}
        </p>
      )}
    </div>
  )
}
