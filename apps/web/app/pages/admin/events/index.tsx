import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  FilePenLineIcon,
  FileTextIcon,
  FilterIcon,
  ImageIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from "lucide-react"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
} from "~/components/admin/admin-ui"
import { editorialCoverStyle } from "~/components/editorial/editorial-cover"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  getAdminCommunityPosts,
  getAdminCommunitySpotlight,
  replaceAdminCommunitySpotlight,
  type CommunitySpotlightEntry,
  type EditorialArticle,
} from "~/lib/api"

type Tab = "articles" | "spotlight"
type ArticleStatusFilter = "all" | EditorialArticle["status"]
type ArticleKindFilter = "all" | "event" | "notice"

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function formatDate(value: unknown) {
  const source = stringValue(value)
  if (!source) return "尚未发布"
  const date = new Date(source)
  return Number.isNaN(date.valueOf()) ? source : dateFormatter.format(date)
}

function statusLabel(status: EditorialArticle["status"]) {
  return status === "published"
    ? "已发布"
    : status === "archived"
      ? "已归档"
      : "草稿"
}

function kindLabel(kind?: EditorialArticle["kind"]) {
  return kind === "event" ? "具体活动" : "普通文章"
}

function hasArticleBody(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasArticleBody)
  if (!value || typeof value !== "object") return false
  const node = value as Record<string, unknown>
  if (node.type === "image") return true
  if (node.type === "text" && typeof node.text === "string" && node.text.trim())
    return true
  return Object.values(node).some(hasArticleBody)
}

function articleReadiness(post: EditorialArticle) {
  if (hasArticleBody(post.body_json))
    return { label: "正文已就绪", warning: false }
  if (post.source_url) return { label: "外链文章", warning: false }
  return { label: "待补全正文", warning: true }
}

export function meta() {
  return [{ title: "文章管理 | IMSWeb" }]
}

export default function AdminEventsPage() {
  const [tab, setTab] = useState<Tab>("articles")
  const [posts, setPosts] = useState<EditorialArticle[]>([])
  const [spotlight, setSpotlight] = useState<CommunitySpotlightEntry[]>([])
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<ArticleStatusFilter>("all")
  const [kindFilter, setKindFilter] = useState<ArticleKindFilter>("all")
  const [loading, setLoading] = useState(true)
  const [savingSpotlight, setSavingSpotlight] = useState(false)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const [postResult, spotlightResult] = await Promise.all([
        getAdminCommunityPosts().send(),
        getAdminCommunitySpotlight().send(),
      ])
      setPosts(postResult.items)
      setSpotlight(spotlightResult.items)
    } catch (reason) {
      setError(true)
      toast.error(adminErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(refresh)
  }, [refresh])

  const selectedIds = useMemo(
    () => new Set(spotlight.map((entry) => entry.post_id)),
    [spotlight]
  )
  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return posts.filter((post) => {
      const searchable =
        `${post.title} ${post.summary} ${post.source_url ?? ""}`.toLocaleLowerCase()
      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (statusFilter === "all" || post.status === statusFilter) &&
        (kindFilter === "all" || post.kind === kindFilter)
      )
    })
  }, [kindFilter, posts, query, statusFilter])
  const availablePosts = posts.filter(
    (post) => post.status === "published" && !selectedIds.has(Number(post.id))
  )
  const counts = useMemo(
    () => ({
      all: posts.length,
      published: posts.filter((post) => post.status === "published").length,
      draft: posts.filter((post) => post.status === "draft").length,
      needsWork: posts.filter(
        (post) => !hasArticleBody(post.body_json) && !post.source_url
      ).length,
    }),
    [posts]
  )

  function addSpotlight(post: EditorialArticle) {
    setSpotlight((current) => [
      ...current,
      {
        post_id: Number(post.id),
        category: "activity",
        sort_order: current.length,
        title: post.title,
        status: post.status,
        image_url: post.cover_url ?? post.image_url,
        kind: post.kind ?? "notice",
        cover_transform: post.cover_transform,
      },
    ])
  }

  function removeSpotlight(postId: number) {
    setSpotlight((current) =>
      current
        .filter((entry) => entry.post_id !== postId)
        .map((entry, index) => ({ ...entry, sort_order: index }))
    )
  }

  function moveSpotlight(postId: number, direction: -1 | 1) {
    setSpotlight((current) => {
      const index = current.findIndex((entry) => entry.post_id === postId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [entry] = next.splice(index, 1)
      next.splice(target, 0, entry)
      return next.map((item, order) => ({ ...item, sort_order: order }))
    })
  }

  async function saveSpotlight() {
    setSavingSpotlight(true)
    try {
      await replaceAdminCommunitySpotlight(
        spotlight.map((entry) => ({
          postId: entry.post_id,
          category: entry.category,
        }))
      ).send()
      toast.success("首页精选已保存")
      await refresh()
    } catch (reason) {
      toast.error(adminErrorMessage(reason))
    } finally {
      setSavingSpotlight(false)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="EDITORIAL CONTENT"
        title="文章"
        description="创建、编辑和发布社区文章；首页精选只负责把已经发布的文章分发给用户。"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : null}
              刷新
            </Button>
            <NavigationLink href="/admin/events/new">
              <Button>
                <PlusIcon data-icon="inline-start" />
                新建文章
              </Button>
            </NavigationLink>
          </>
        }
      />

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="文章统计"
      >
        {[
          ["全部文章", counts.all, "包含历史迁移内容", "border-l-primary"],
          ["已发布", counts.published, "当前公开可见", "border-l-success"],
          ["草稿", counts.draft, "仅管理员可见", "border-l-warning"],
          [
            "待补全",
            counts.needsWork,
            "缺少正文或来源",
            "border-l-muted-foreground",
          ],
        ].map(([label, value, description, color]) => (
          <div
            key={String(label)}
            className={`border border-l-[3px] bg-card p-4 shadow-xs ${color}`}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        ))}
      </section>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="文章管理视图"
      >
        <Button
          type="button"
          role="tab"
          aria-selected={tab === "articles"}
          variant={tab === "articles" ? "default" : "outline"}
          onClick={() => setTab("articles")}
        >
          文章工作台
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={tab === "spotlight"}
          variant={tab === "spotlight" ? "default" : "outline"}
          onClick={() => setTab("spotlight")}
        >
          首页精选
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
          <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
          正在读取文章
        </div>
      ) : null}
      {!loading && error ? (
        <AdminEmptyState
          icon={FileTextIcon}
          title="无法读取文章"
          description="请确认服务状态后重试。"
        />
      ) : null}

      {!loading && !error && tab === "articles" ? (
        <AdminPanel
          title="文章工作台"
          description="快速定位内容、检查发布状态，并进入全页编辑器。"
          contentClassName="px-0"
        >
          <div className="flex flex-col gap-3 border-b px-4 pb-4 sm:flex-row sm:items-center sm:px-5">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、摘要或来源链接"
                aria-label="搜索文章"
              />
            </div>
            <div className="flex gap-2">
              <FilterIcon
                className="mt-2 size-4 shrink-0 text-muted-foreground sm:hidden"
                aria-hidden="true"
              />
              <select
                className={`${adminControlClass} h-9 w-auto min-w-25`}
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as ArticleStatusFilter)
                }
                aria-label="按状态筛选"
              >
                <option value="all">全部状态</option>
                <option value="published">已发布</option>
                <option value="draft">草稿</option>
                <option value="archived">已归档</option>
              </select>
              <select
                className={`${adminControlClass} h-9 w-auto min-w-25`}
                value={kindFilter}
                onChange={(event) =>
                  setKindFilter(event.target.value as ArticleKindFilter)
                }
                aria-label="按类型筛选"
              >
                <option value="all">全部类型</option>
                <option value="notice">普通文章</option>
                <option value="event">具体活动</option>
              </select>
            </div>
          </div>
          {filteredPosts.length ? (
            <div className="divide-y">
              {filteredPosts.map((post) => {
                const readiness = articleReadiness(post)
                const imageUrl = post.cover_url ?? post.image_url
                const publishedAt = stringValue(post.published_at)
                return (
                  <article
                    key={post.id}
                    className="group grid gap-4 p-4 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center sm:px-5"
                  >
                    <div className="aspect-16/10 overflow-hidden rounded-lg border bg-muted/40">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="size-full object-cover"
                          style={editorialCoverStyle(post.cover_transform)}
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-muted-foreground">
                          <ImageIcon className="size-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            post.status === "published"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {statusLabel(post.status)}
                        </Badge>
                        <Badge variant="outline">{kindLabel(post.kind)}</Badge>
                        <Badge
                          variant={readiness.warning ? "secondary" : "outline"}
                        >
                          {readiness.label}
                        </Badge>
                        {selectedIds.has(Number(post.id)) ? (
                          <Badge variant="outline">
                            <StarIcon className="size-3" />
                            首页精选
                          </Badge>
                        ) : null}
                      </div>
                      <NavigationLink
                        href={`/admin/events/${post.id}`}
                        className="mt-2 block w-fit leading-6 font-semibold hover:text-primary hover:underline"
                      >
                        {post.title}
                      </NavigationLink>
                      <p className="mt-1 line-clamp-2 text-sm/6 text-muted-foreground">
                        {post.summary ||
                          (post.source_url
                            ? "该文章会引导用户查看原页面。"
                            : "尚未填写文章摘要。")}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {publishedAt
                          ? `发布于 ${formatDate(publishedAt)}`
                          : `最近更新 ${formatDate(post.updated_at ?? post.created_at)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2 sm:justify-self-end">
                      <NavigationLink href={`/admin/events/${post.id}`}>
                        <Button variant="outline" size="sm">
                          <FilePenLineIcon data-icon="inline-start" />
                          编辑
                        </Button>
                      </NavigationLink>
                      <NavigationLink
                        href={`/events/${post.id}`}
                        target="_blank"
                      >
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`打开${post.title}的公开页面`}
                          title="查看公开页面"
                        >
                          <ExternalLinkIcon />
                        </Button>
                      </NavigationLink>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <AdminEmptyState
              icon={FileTextIcon}
              title="没有符合条件的文章"
              description="尝试清除搜索词或调整筛选条件。"
            />
          )}
        </AdminPanel>
      ) : null}

      {!loading && !error && tab === "spotlight" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <AdminPanel
            title="首页精选顺序"
            description="这是分发配置，不会复制或修改文章正文。撤回文章后，其精选项会自动对用户隐藏。"
          >
            {spotlight.length ? (
              <div className="divide-y border-y">
                {spotlight.map((entry, index) => (
                  <div
                    key={entry.post_id}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <span className="w-6 text-center text-sm text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{entry.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.status === "published"
                          ? "已发布，当前会显示在首页"
                          : "当前不会公开"}
                      </p>
                    </div>
                    <select
                      className={`${adminControlClass} h-9 w-28`}
                      value={entry.category}
                      onChange={(event) =>
                        setSpotlight((current) =>
                          current.map((item) =>
                            item.post_id === entry.post_id
                              ? {
                                  ...item,
                                  category: event.target.value as
                                    | "activity"
                                    | "fan",
                                }
                              : item
                          )
                        )
                      }
                      aria-label={`设置${entry.title}的精选分类`}
                    >
                      <option value="activity">活动资讯</option>
                      <option value="fan">同人活动</option>
                    </select>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => moveSpotlight(entry.post_id, -1)}
                      aria-label="上移"
                    >
                      <ChevronUpIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === spotlight.length - 1}
                      onClick={() => moveSpotlight(entry.post_id, 1)}
                      aria-label="下移"
                    >
                      <ChevronDownIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeSpotlight(entry.post_id)}
                      aria-label="移出精选"
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <AdminEmptyState
                icon={StarIcon}
                title="还没有首页精选"
                description="从右侧添加已发布的文章。"
              />
            )}
            <div className="mt-5 flex justify-end">
              <Button
                disabled={savingSpotlight}
                onClick={() => void saveSpotlight()}
              >
                {savingSpotlight ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <CheckCircle2Icon data-icon="inline-start" />
                )}
                保存精选
              </Button>
            </div>
          </AdminPanel>
          <AdminPanel
            title="添加已发布文章"
            description="加入后可以设置分类和首页显示顺序。"
          >
            <div className="space-y-2">
              {availablePosts.length ? (
                availablePosts.map((post) => (
                  <Button
                    key={post.id}
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-start py-3 text-left"
                    onClick={() => addSpotlight(post)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{post.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {kindLabel(post.kind)}
                      </span>
                    </span>
                    <StarIcon className="ml-auto size-4" />
                  </Button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  没有可加入的已发布文章。
                </p>
              )}
            </div>
          </AdminPanel>
        </div>
      ) : null}
    </div>
  )
}
