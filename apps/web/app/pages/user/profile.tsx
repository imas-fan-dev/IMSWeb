import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router"
import {
  ArrowLeftRightIcon,
  ShareIcon,
  MapPinIcon,
  PencilLineIcon,
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
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] items-start gap-4">
            {owned.map((card) => {
              const cover = namecardPages(card)[0]?.thumb ?? ""
              return (
                <li
                  key={card.id}
                  className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow focus-within:shadow-md hover:shadow-md"
                >
                  <button
                    type="button"
                    className="block w-full cursor-zoom-in overflow-hidden bg-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    aria-label={`查看制作人名片 ${card.cardNumber} 正面`}
                    onClick={(event) => {
                      returnFocusRef.current = event.currentTarget
                      setOpenCard(card)
                    }}
                  >
                    <CardImage
                      src={cover}
                      alt={`制作人名片 ${card.cardNumber} 正面`}
                      className="block h-auto w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                  </button>
                  <div className="flex items-center gap-2 border-t px-3 py-2">
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      名片 #{card.cardNumber}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="ml-auto"
                      disabled
                      title={
                        isSelf
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
            })}
          </ul>
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
