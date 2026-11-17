import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router"
import {
  ArrowLeftRightIcon,
  CalendarIcon,
  ImagesIcon,
  MapPinIcon,
  PackageCheckIcon,
  PencilLineIcon,
  ShareIcon,
  SparklesIcon,
  UserRoundXIcon,
} from "lucide-react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { CardImage } from "~/components/shared/card-image"
import { namecardPages } from "~/components/shared/namecard-pages"
import { NamecardPreview } from "~/components/shared/namecard-preview"
import { PageShell } from "~/components/shared/page-shell"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { NamecardDetailDialog } from "~/pages/community/components/namecard-detail-dialog"
import {
  addNamecardReaction,
  getNamecardReactions,
  getProfileCards,
  getPublicProfile,
} from "~/lib/api"
import { toast } from "sonner"
import { PlatformAccountList } from "~/components/profile/platform-account-list"
import { cardTimeLabel } from "~/lib/namecards/dates"
import type { Namecard as NamecardRecord, NamecardPage } from "~/lib/api"

export function meta() {
  return [{ title: "制作人主页 | IMSWeb" }]
}

type Profile = Awaited<ReturnType<ReturnType<typeof getPublicProfile>["send"]>>

const PAGE_SIZE = 48

/**
 * 主页要把这个人公开的名片一次铺开，所以按页取到没有下一页为止；
 * 接口仍然分页，避免一次查询把整张表拖出来。
 */
async function loadAllCards(accountId: string) {
  const first = await getProfileCards(accountId, 1, PAGE_SIZE).send()
  const list = [...first.list]
  let page = 1
  while (first.totalPage > page && page < 20) {
    page += 1
    const next = await getProfileCards(accountId, page, PAGE_SIZE).send()
    if (next.list.length === 0) break
    list.push(...next.list)
  }
  return { ...first, list } satisfies NamecardPage
}

const CARD_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] items-start gap-4"

interface ProfileCardSection {
  /** 默认分组没有标题（属主配置的组都带标题），渲染时不画组头。 */
  title: string | null
  cards: NamecardRecord[]
}

/**
 * 按属主布局把公开名片切成若干屏：`groups` 的顺序就是渲染顺序，组里没有公开卡片的组丢掉，
 * 布局里还没提到的卡（含属主从没整理过的）归入默认分组并排在最前——与后端
 * `flattenCardLayout` 的顺序一致。
 */
function profileCardSections(
  cards: readonly NamecardRecord[],
  groups: NonNullable<NamecardPage["groups"]> = []
): ProfileCardSection[] {
  const byNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const placed = new Set<number>()
  const sections: ProfileCardSection[] = []
  for (const group of groups) {
    const groupCards: NamecardRecord[] = []
    for (const cardNumber of group.cardNumbers) {
      const card = byNumber.get(cardNumber)
      // 分组里出现不属于这个人（或已经排过）的编号时跳过，同一张卡不会铺两遍。
      if (!card || placed.has(cardNumber)) continue
      placed.add(cardNumber)
      groupCards.push(card)
    }
    if (groupCards.length > 0) {
      sections.push({ title: group.title, cards: groupCards })
    }
  }
  const defaultCards = cards.filter((card) => !placed.has(card.cardNumber))
  return defaultCards.length > 0
    ? [{ title: null, cards: defaultCards }, ...sections]
    : sections
}

/**
 * 主页瓦片：1:1 缩略图容器 + 制作日期，样式与「名片管理」的瓦片一致。
 *
 * 公开主页不出现属主视角的任何徽标（隐藏、快速交换、审核状态）；只有存在中间页
 * （`pageCount > 2`）时才在缩略图右上角标出页数，规则与后台名片审核界面相同。
 * 左上角的「已交换」是**浏览者视角**的标记（登录浏览者名片册里已有这张卡），
 * 不受上面那条约束。
 */
function ProfileCardTile({
  card,
  isSelf,
  onOpen,
}: {
  card: NamecardRecord
  isSelf: boolean
  onOpen: (card: NamecardRecord, trigger: HTMLButtonElement) => void
}) {
  const cover = namecardPages(card)[0]?.thumb ?? ""
  // 日期规则与名片管理一致：`madeOn` 填到哪就显示到哪，没填回退创建时间。
  const date = cardTimeLabel({
    madeOn: card.madeOn,
    createdAt: card.created_at ?? "",
  })
  const pageCount = card.pageCount ?? 1
  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow focus-within:shadow-md hover:shadow-md">
      <button
        type="button"
        className="block w-full cursor-zoom-in p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        aria-label={`查看制作人名片 ${card.cardNumber} 正面`}
        onClick={(event) => onOpen(card, event.currentTarget)}
      >
        <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-border">
          <CardImage
            src={cover}
            alt={`制作人名片 ${card.cardNumber} 正面`}
            className="max-h-full max-w-full border border-foreground/25 object-contain transition-transform duration-200 group-hover:scale-[1.02]"
          />
          {card.collected && !isSelf ? (
            <Badge
              className="absolute top-2 left-2 z-10 gap-1 border-transparent bg-success-soft text-success-soft-foreground shadow-sm"
              aria-label="已交换过这张名片"
              title="已交换过这张名片"
            >
              <PackageCheckIcon aria-hidden="true" />
              已交换
            </Badge>
          ) : null}
          {pageCount > 2 ? (
            <Badge className="absolute top-2 right-2 z-10 gap-1 border-border bg-background/90 text-foreground shadow-sm">
              <ImagesIcon aria-hidden="true" />
              {pageCount}
            </Badge>
          ) : null}
        </span>
      </button>
      <div className="flex items-center gap-2 border-t px-3 py-2">
        {date ? (
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <CalendarIcon className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{date}</span>
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="ml-auto shrink-0"
          disabled
          title={
            card.collected && !isSelf
              ? "你已经拥有这张名片"
              : isSelf
                ? "分享功能暂未开放"
                : card.exchangeMode === "none"
                  ? "这张名片不接受交换"
                  : "暂未开放"
          }
        >
          {isSelf ? (
            <ShareIcon aria-hidden="true" />
          ) : (
            <ArrowLeftRightIcon aria-hidden="true" />
          )}
          {isSelf ? "分享" : "交换"}
        </Button>
      </div>
    </li>
  )
}

/**
 * 用户主页：上半是公开资料，下半是这个人自己持有的名片。
 * 名片详情复用名片墙那一套窗口，避免两份实现各自漂移。
 */
export default function UserProfilePage() {
  const { accountId = "" } = useParams<{ accountId: string }>()
  const platform = useOptionalPlatformSession()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [missing, setMissing] = useState(false)
  const [cards, setCards] = useState<NamecardPage | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = loadedFor !== accountId
  const [openCard, setOpenCard] = useState<NamecardRecord | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [busyReaction, setBusyReaction] = useState(false)
  const previewReturnRef = useRef<HTMLButtonElement | null>(null)
  const [reactions, setReactions] = useState<
    Record<number, Record<string, number>>
  >({})
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([
      getPublicProfile(accountId).send(),
      loadAllCards(accountId).catch(() => null),
    ])
      .then(([nextProfile, nextCards]) => {
        if (!active) return
        setProfile(nextProfile)
        setCards(nextCards)
        setMissing(false)
      })
      .catch(() => {
        if (active) setMissing(true)
      })
      .finally(() => {
        if (active) setLoadedFor(accountId)
      })
    return () => {
      active = false
    }
  }, [accountId])

  const owned = useMemo(() => cards?.list ?? [], [cards])
  // 分组顺序取自第一页响应（全量卡片都在 `list` 里，分组不会跨页）。
  const sections = useMemo(
    () => profileCardSections(owned, cards?.groups ?? []),
    [owned, cards]
  )
  // 路由参数可能是 uid 或 slug，只有接口回来的 accountId 才可靠。
  const isSelf =
    platform.status === "authenticated" &&
    profile !== null &&
    platform.session?.account.id === profile.accountId

  async function reactTo(cardId: number, emoji: string) {
    if (busyReaction) return false
    setBusyReaction(true)
    try {
      await addNamecardReaction(cardId, emoji).send()
      setReactions((current) => ({
        ...current,
        [cardId]: {
          ...(current[cardId] ?? {}),
          [emoji]: ((current[cardId] ?? {})[emoji] ?? 0) + 1,
        },
      }))
      return true
    } catch {
      toast.error("暂时无法添加反应")
      return false
    } finally {
      setBusyReaction(false)
    }
  }

  useEffect(() => {
    if (!openCard || reactions[openCard.id]) return
    void getNamecardReactions(openCard.id)
      .send()
      .then((next) =>
        setReactions((current) => ({ ...current, [openCard.id]: next }))
      )
      .catch(() => undefined)
  }, [openCard, reactions])

  if (missing) {
    return (
      <PageShell width="wide" className="py-10">
        <section className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-12 text-center">
          <UserRoundXIcon
            className="size-10 text-muted-foreground"
            aria-hidden="true"
          />
          <h1 className="text-xl font-semibold">找不到这位制作人</h1>
          <p className="text-sm text-muted-foreground">
            主页地址可能拼错了，或者这个帐号已经注销。
          </p>
          <NavigationLink
            to="/community/cards"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            去名片墙看看
          </NavigationLink>
        </section>
      </PageShell>
    )
  }

  const initial = profile?.displayName?.trim().slice(0, 2) || "?"

  return (
    <PageShell width="wide" className="space-y-8 py-6 sm:py-8">
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div
          className="h-20 bg-[linear-gradient(120deg,color-mix(in_oklab,var(--primary)_18%,transparent),color-mix(in_oklab,var(--accent)_28%,transparent))] sm:h-24"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-start sm:gap-6 sm:px-7">
          {loading && !profile ? (
            <Skeleton className="-mt-10 size-24 rounded-full ring-4 ring-card sm:-mt-12" />
          ) : (
            <Avatar className="-mt-10 size-24 ring-4 ring-card sm:-mt-12 sm:size-28">
              {profile?.avatarUrl ? (
                <AvatarImage
                  src={profile.avatarUrl}
                  alt={`${profile.displayName} 的头像`}
                />
              ) : null}
              <AvatarFallback className="text-2xl font-semibold">
                {initial}
              </AvatarFallback>
            </Avatar>
          )}

          <div className="min-w-0 flex-1 space-y-2 sm:pt-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="min-w-0 truncate text-2xl font-semibold sm:text-3xl">
                {profile?.displayName ?? "\u00a0"}
              </h1>
              <Badge variant="secondary" className="shrink-0">
                <SparklesIcon aria-hidden="true" />
                公开名片 {owned.length}
              </Badge>
              {isSelf ? (
                <NavigationLink
                  to="/account/me"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <PencilLineIcon className="size-3.5" aria-hidden="true" />
                  编辑资料
                </NavigationLink>
              ) : null}
            </div>

            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPinIcon className="size-4 shrink-0" aria-hidden="true" />
              {profile?.homeCity ? (
                profile.homeCity
              ) : (
                <span className="text-muted-foreground/70">未填写常驻城市</span>
              )}
            </p>

            {profile?.accounts.length ? (
              <PlatformAccountList accounts={profile.accounts} />
            ) : null}

            {profile?.bio ? (
              <p className="max-w-2xl text-sm/relaxed whitespace-pre-wrap text-foreground/90">
                {profile.bio}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/70">
                这位制作人还没有写简介。
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <header className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">名片</h2>
          <p className="text-xs text-muted-foreground">
            只显示所有者公开的名片 · 共 {owned.length} 张
          </p>
        </header>

        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        ) : owned.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            这位制作人还没有公开的名片。
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((section, index) => {
              const tiles = section.cards.map((card) => (
                <ProfileCardTile
                  key={card.id}
                  card={card}
                  isSelf={isSelf}
                  onOpen={(next, trigger) => {
                    returnFocusRef.current = trigger
                    setOpenCard(next)
                  }}
                />
              ))
              if (section.title === null) {
                return (
                  <ul key={`default-${index}`} className={CARD_GRID_CLASS}>
                    {tiles}
                  </ul>
                )
              }
              const headingId = `profile-card-group-${index}`
              return (
                <section
                  key={`group-${index}`}
                  aria-labelledby={headingId}
                  className="min-w-0 space-y-3"
                >
                  <div className="flex min-w-0 items-center gap-2 border-b pb-2">
                    <h3 id={headingId} className="truncate text-sm font-medium">
                      {section.title}
                    </h3>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {section.cards.length} 张
                    </span>
                  </div>
                  <ul className={CARD_GRID_CLASS}>{tiles}</ul>
                </section>
              )
            })}
          </div>
        )}
      </section>

      <NamecardPreview
        card={previewIndex === null ? null : openCard}
        pages={openCard ? namecardPages(openCard) : []}
        index={previewIndex ?? 0}
        onIndexChange={setPreviewIndex}
        onOpenChange={(open) => {
          if (!open) setPreviewIndex(null)
        }}
        finalFocus={() => previewReturnRef.current}
      />
      <NamecardDetailDialog
        card={openCard}
        canClaim={false}
        reactions={{
          reactions: openCard ? (reactions[openCard.id] ?? {}) : {},
          loading: Boolean(openCard && !reactions[openCard.id]),
        }}
        busy={busyReaction}
        onOpenChange={(open) => {
          if (!open) setOpenCard(null)
        }}
        onOpenPreview={(index, trigger) => {
          previewReturnRef.current = trigger
          setPreviewIndex(index)
        }}
        onClaim={() => undefined}
        onSupplement={() => undefined}
        onReact={(emoji) =>
          openCard ? reactTo(openCard.id, emoji) : Promise.resolve(false)
        }
        onReturnFocus={() => {
          returnFocusRef.current?.focus()
        }}
      />
    </PageShell>
  )
}
