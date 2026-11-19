import { useEffect, useRef, useState } from "react"

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ImagesIcon,
  LibraryIcon,
  Settings2Icon,
} from "lucide-react"
import { toast } from "sonner"

import type { NamecardCollectionEntry } from "@imsweb/contracts/namecards"

import {
  DEFAULT_NAMECARD_FILTERS,
  NamecardFilterBar,
  type NamecardFilterValue,
} from "~/components/community/namecard-filters/namecard-filter-bar"
import type { SeriesOption } from "~/components/community/series-multi-select"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { Skeleton } from "~/components/ui/skeleton"
import {
  addNamecardReaction,
  getFudabaSeries,
  getNamecardCollectionPage,
  getNamecardReactions,
  setNamecardCollectionHidden,
} from "~/lib/api"
import type { NamecardCollectionPage, NamecardReactions } from "~/lib/api"
import { NAMECARD_COLLECTION_PAGE_SIZE } from "~/lib/namecards/collection-query"
import { readShowOwn, writeShowOwn } from "~/lib/namecards/show-own-preference"
import { cn } from "~/lib/utils"
import { useNamecardCharacterCatalog } from "~/lib/use-namecard-character-catalog"
import {
  NamecardDetailDialog,
  type NamecardReactionState,
} from "~/pages/community/components/namecard-detail-dialog"

/** 输入停顿多久才发请求；筛选本身不防抖（选完就该等结果）。 */
const SEARCH_DEBOUNCE_MS = 300

const EMPTY_REACTIONS: NamecardReactionState = {
  reactions: {},
  loading: false,
}

/**
 * 一条瓦片：1:1 容器里居中放正面缩略图，底部是制作人名。
 *
 * 容器与缩略图各自带边框：容器保持方形并裁掉溢出的边角，图片用
 * `object-contain` 完整显示，不同比例的图不会被裁。`card` 为空的条目
 * （后台已过滤，前端兜底）不渲染，名称也只取 `card.producerName`。
 */
function CollectionTile({
  entry,
  onOpen,
}: {
  entry: NamecardCollectionEntry
  onOpen: (entry: NamecardCollectionEntry) => void
}) {
  const card = entry.card
  if (!card) return null
  const front = card.pages?.find((page) => page.role === "front")
  const dimmed = entry.hiddenAt !== null

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {front ? (
        <button
          type="button"
          className={cn(
            "flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40 p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            dimmed && "opacity-70"
          )}
          aria-label={`查看名片 #${entry.cardNumber}`}
          onClick={() => onOpen(entry)}
        >
          <img
            src={front.thumbUrl ?? front.url}
            alt=""
            loading="lazy"
            className="max-h-full max-w-full border object-contain"
          />
        </button>
      ) : (
        <div
          className={cn(
            "flex aspect-square items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground",
            dimmed && "opacity-70"
          )}
        >
          <ImagesIcon className="size-6" aria-hidden="true" />
          <span className="sr-only">
            名片 #{entry.cardNumber} 的图片已不可用
          </span>
        </div>
      )}
      {entry.owner ? (
        <NavigationLink
          to={`/user/${entry.owner.uid}`}
          className="block truncate px-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {card.producerName ?? "未知制作人"}
        </NavigationLink>
      ) : (
        <p className="truncate px-0.5 text-xs text-muted-foreground">
          {card.producerName ?? "未知制作人"}
        </p>
      )}
    </div>
  )
}

/** 【左箭头 + 页码 + 右箭头】：点页码弹下拉，选第 N 页就跳过去（PRD §2）。 */
function CollectionPagination({
  page,
  totalPage,
  onChange,
}: {
  page: number
  totalPage: number
  onChange: (page: number) => void
}) {
  const [open, setOpen] = useState(false)
  const lastPage = Math.max(totalPage, 1)

  return (
    <nav
      aria-label="名片册分页"
      className="mt-6 flex items-center justify-center gap-3"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="上一页"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ArrowLeftIcon aria-hidden="true" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="min-w-24 tabular-nums"
              aria-label={`第 ${page} 页，共 ${lastPage} 页，选择页码`}
            />
          }
        >
          {page} / {lastPage}
        </PopoverTrigger>
        <PopoverContent align="center" className="w-40">
          <PopoverTitle className="mb-2">跳转到页码</PopoverTitle>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {Array.from({ length: lastPage }, (_, index) => index + 1).map(
              (target) => (
                <Button
                  key={target}
                  type="button"
                  variant={target === page ? "secondary" : "ghost"}
                  className="justify-start tabular-nums"
                  aria-label={`第 ${target} 页`}
                  onClick={() => {
                    setOpen(false)
                    if (target !== page) onChange(target)
                  }}
                >
                  {target}
                </Button>
              )
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="下一页"
        disabled={page >= lastPage}
        onClick={() => onChange(page + 1)}
      >
        <ArrowRightIcon aria-hidden="true" />
      </Button>
    </nav>
  )
}

/**
 * 名片册（PRD §2–§6）：筛选、两个显示开关、瓦片栅格与跳页下拉。
 *
 * `active` 由账号工作区传入：名片册默认是隐藏的页签，没打开就不该发请求。
 */
export function NamecardCollection({ active = true }: { active?: boolean }) {
  const platform = useOptionalPlatformSession()
  const accountId = platform.session?.account.id ?? null
  const [loadedOwnerScope, setLoadedOwnerScope] = useState<string | null>(null)
  const [filters, setFilters] = useState<NamecardFilterValue>(
    DEFAULT_NAMECARD_FILTERS
  )
  const [page, setPage] = useState(1)
  const [includeOwn, setIncludeOwn] = useState(false)
  const [includeHidden, setIncludeHidden] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 搜索框即时响应，查询串慢半拍。
  const [search, setSearch] = useState("")

  const [result, setResult] = useState<NamecardCollectionPage | null>(null)
  const [loading, setLoading] = useState(active)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)

  const [series, setSeries] = useState<readonly SeriesOption[]>([])
  const [selected, setSelected] = useState<NamecardCollectionEntry | null>(null)
  const [hideBusyCard, setHideBusyCard] = useState<number | null>(null)
  const [reactions, setReactions] =
    useState<NamecardReactionState>(EMPTY_REACTIONS)
  const reactionRequest = useRef(0)

  const { catalog, loading: catalogLoading } =
    useNamecardCharacterCatalog(active)

  const { q, sort, dir, characterIds, matchAll, excludeOther, seriesCodes } =
    filters
  const group = filters.group
  const owner = filters.owner
  const excludeCross = filters.excludeCross
  const invert = filters.invert
  const declaration = filters.declaration

  /** 查询指纹：变化即重新取数，也用来在渲染期清掉上一页。 */
  const queryKey = active
    ? [
        reload,
        page,
        search,
        sort,
        dir,
        characterIds.join(","),
        seriesCodes.join(","),
        group,
        owner?.accountId ?? "",
        matchAll,
        excludeOther,
        excludeCross,
        invert,
        declaration ?? "",
        includeOwn,
        includeHidden,
      ].join("|")
    : "idle"
  const [loadedQuery, setLoadedQuery] = useState(queryKey)
  // 与名片墙同一手法：渲染期发现查询变了就重置，别在 effect 里同步 setState。
  if (loadedQuery !== queryKey) {
    setLoadedQuery(queryKey)
    setLoading(active)
    setFailed(false)
    setResult(null)
  }

  // 【显示我的名片】跟随账号记忆：会话就绪（拿到 accountId）后才读取。
  // 与查询指纹同一手法——渲染期发现账号换了就同步一次，不在 effect 里 setState；
  // 没读到值之前也不会把默认值写回存储。
  if (loadedOwnerScope !== accountId) {
    setLoadedOwnerScope(accountId)
    setIncludeOwn(readShowOwn(accountId))
  }

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    getFudabaSeries()
      .send()
      .then((payload) => {
        if (!cancelled) setSeries(payload.items)
      })
      .catch(() => {
        if (!cancelled) setSeries([])
      })
    return () => {
      cancelled = true
    }
  }, [active])

  const requestGeneration = useRef(0)
  useEffect(() => {
    if (!active) return
    const generation = ++requestGeneration.current
    getNamecardCollectionPage({
      page,
      size: NAMECARD_COLLECTION_PAGE_SIZE,
      sort,
      dir,
      q: search || undefined,
      series: seriesCodes,
      group: group.trim() || undefined,
      owner: owner?.accountId,
      character: characterIds,
      match: matchAll ? "all" : "any",
      excludeOther,
      excludeCross,
      invert,
      declaration: declaration ?? undefined,
      includeOwn,
      includeHidden,
    })
      .send()
      .then((payload) => {
        if (requestGeneration.current !== generation) return
        setResult(payload)
        setLoading(false)
      })
      .catch(() => {
        if (requestGeneration.current !== generation) return
        setFailed(true)
        setLoading(false)
      })
  }, [
    active,
    page,
    search,
    sort,
    dir,
    seriesCodes,
    group,
    owner,
    characterIds,
    matchAll,
    excludeOther,
    excludeCross,
    invert,
    declaration,
    includeOwn,
    includeHidden,
    reload,
  ])

  function changeFilters(next: NamecardFilterValue) {
    setFilters(next)
    setPage(1)
  }

  function changePage(next: number) {
    setPage(next)
  }

  function openEntry(entry: NamecardCollectionEntry) {
    setSelected(entry)
    const card = entry.card
    if (!card) return
    const request = ++reactionRequest.current
    setReactions({ reactions: {}, loading: true })
    getNamecardReactions(card.id)
      .send()
      .then((payload: NamecardReactions) => {
        if (reactionRequest.current === request) {
          setReactions({ reactions: payload, loading: false })
        }
      })
      .catch(() => {
        if (reactionRequest.current === request) {
          setReactions({ reactions: {}, loading: false })
        }
      })
  }

  async function react(emoji: string) {
    const card = selected?.card
    if (!card) return false
    try {
      await addNamecardReaction(card.id, emoji).send()
      setReactions((current) => ({
        ...current,
        reactions: {
          ...current.reactions,
          [emoji]: (current.reactions[emoji] ?? 0) + 1,
        },
      }))
      return true
    } catch {
      toast.error("暂时无法添加反应，请稍后再试。")
      return false
    }
  }

  async function toggleHidden(entry: NamecardCollectionEntry) {
    const hidden = entry.hiddenAt === null
    setHideBusyCard(entry.cardNumber)
    try {
      await setNamecardCollectionHidden(entry.cardNumber, hidden).send()
      const hiddenAt = hidden ? new Date().toISOString() : null
      setResult((current) =>
        current
          ? {
              ...current,
              list: current.list.map((item) =>
                item.cardNumber === entry.cardNumber
                  ? { ...item, hiddenAt }
                  : item
              ),
            }
          : current
      )
      setSelected((current) =>
        current && current.cardNumber === entry.cardNumber
          ? { ...current, hiddenAt }
          : current
      )
      // 按当前开关重新取数：隐藏的条目在【显示隐藏名片】关闭时立即消失，
      // total / totalPage 也随之更新。
      setReload((current) => current + 1)
      toast.success(hidden ? "已隐藏这张名片" : "已取消隐藏")
    } catch {
      toast.error("暂时无法更新显示状态，请稍后重试。")
    } finally {
      setHideBusyCard(null)
    }
  }

  const filtered =
    q.trim() !== "" ||
    owner !== null ||
    characterIds.length > 0 ||
    seriesCodes.length > 0 ||
    group.trim() !== "" ||
    excludeCross ||
    invert ||
    declaration !== null ||
    matchAll ||
    excludeOther
  const list = result?.list ?? []
  const totalPage = result?.totalPage ?? 0

  return (
    <div>
      <div className="flex items-end justify-between gap-3 border-b pb-5">
        <div className="min-w-0">
          <h2
            id="profile-workspace-collection-title"
            className="text-xl font-semibold"
          >
            名片册
          </h2>
          <p className="mt-2 text-sm/6 text-muted-foreground">
            交换得来的名片会收在这里。
          </p>
        </div>

        <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="显示设置"
              />
            }
          >
            <Settings2Icon aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <PopoverTitle className="mb-2">显示选项</PopoverTitle>
            <div className="flex flex-col gap-1">
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <Checkbox
                  checked={includeOwn}
                  onCheckedChange={(next) => {
                    const checked = next === true
                    setIncludeOwn(checked)
                    setPage(1)
                    writeShowOwn(accountId, checked)
                  }}
                />
                显示我的名片
              </label>
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <Checkbox
                  checked={includeHidden}
                  onCheckedChange={(next) => {
                    setIncludeHidden(next === true)
                    setPage(1)
                  }}
                />
                显示隐藏名片
              </label>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-6">
        <NamecardFilterBar
          value={filters}
          onChange={changeFilters}
          series={series}
          catalog={catalog}
          catalogLoading={catalogLoading}
          disabled={!active}
        />
      </div>

      <section className="mt-4" aria-label="收集的名片" aria-busy={loading}>
        {loading && !result ? (
          <div role="status">
            <span className="sr-only">正在读取名片册…</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="aspect-square rounded-md" />
              ))}
            </div>
          </div>
        ) : null}

        {failed ? (
          <Alert variant="destructive">
            <ImagesIcon aria-hidden="true" />
            <AlertTitle>暂时无法读取名片册</AlertTitle>
            <AlertDescription>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setReload((current) => current + 1)}
              >
                重试读取名片册
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {!failed && list.length === 0 && !loading ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LibraryIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {filtered ? "没有符合条件的名片" : "名片册还是空的"}
              </EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? "换个筛选条件试试。"
                  : "通过交换得到名片后，它会出现在这里。"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {list.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
            {list.map((entry) => (
              <CollectionTile
                key={entry.cardNumber}
                entry={entry}
                onOpen={openEntry}
              />
            ))}
          </div>
        ) : null}

        {list.length > 0 ? (
          <CollectionPagination
            page={page}
            totalPage={totalPage}
            onChange={changePage}
          />
        ) : null}
      </section>

      <NamecardDetailDialog
        card={selected?.card ?? null}
        reactions={reactions}
        busy={hideBusyCard === selected?.cardNumber}
        collection={
          selected
            ? selected.own
              ? null
              : {
                  hidden: selected.hiddenAt !== null,
                  busy: hideBusyCard === selected.cardNumber,
                  onToggleHidden: () => void toggleHidden(selected),
                }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        onReact={react}
      />
    </div>
  )
}
