import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { PageShell } from "~/components/shared/page-shell"
import { Skeleton } from "~/components/ui/skeleton"
import { NamecardDetailDialog } from "~/pages/community/components/namecard-detail-dialog"
import {
  getNamecardReactions,
  getProfileCards,
  getPublicProfile,
} from "~/lib/api"
import type { Namecard as NamecardRecord, NamecardPage } from "~/lib/api"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router"

export function meta() {
  return [{ title: "制作人主页 | IMSWeb" }]
}

type Profile = Awaited<ReturnType<ReturnType<typeof getPublicProfile>["send"]>>

/**
 * 用户主页：上半是公开资料，下半是这个人自己持有的名片。
 * 名片详情复用名片墙那一套窗口，避免两份实现各自漂移。
 */
export default function UserProfilePage() {
  const { accountId = "" } = useParams<{ accountId: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [missing, setMissing] = useState(false)
  const [cards, setCards] = useState<NamecardPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [openCard, setOpenCard] = useState<NamecardRecord | null>(null)
  const [reactions, setReactions] = useState<Record<number, Record<string, number>>>({})

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([
      getPublicProfile(accountId).send(),
      getProfileCards(accountId, 1, 48).send().catch(() => null),
    ])
      .then(([nextProfile, nextCards]) => {
        if (!active) return
        setProfile(nextProfile)
        setCards(nextCards)
      })
      .catch(() => {
        if (active) setMissing(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accountId])

  // 服务端已经按「已发布 + 允许展示 + 归属于该帐号」筛过，这里不再过滤。
  const owned = useMemo(() => cards?.list ?? [], [cards])

  useEffect(() => {
    if (!openCard || reactions[openCard.id]) return
    void getNamecardReactions(openCard.id)
      .send()
      .then((next) =>
        setReactions((current) => ({ ...current, [openCard.id]: next })),
      )
      .catch(() => undefined)
  }, [openCard, reactions])

  if (missing) {
    return (
      <PageShell width="wide">
        <Alert variant="destructive">
          <AlertTitle>找不到这位制作人</AlertTitle>
          <AlertDescription>帐号可能已经注销，或者链接里的编号不正确。</AlertDescription>
        </Alert>
      </PageShell>
    )
  }

  return (
    <PageShell width="wide" className="space-y-8 py-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {loading && !profile ? (
          <Skeleton className="size-20 rounded-full" />
        ) : (
          <Avatar className="size-20">
            {profile?.avatarUrl ? (
              <AvatarImage src={profile.avatarUrl} alt={`${profile.displayName} 的头像`} />
            ) : null}
            <AvatarFallback>
              {profile?.displayName?.slice(0, 2) ?? "?"}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold">
            {profile?.displayName ?? "\u00a0"}
          </h1>
          {profile?.homeCity ? (
            <p className="text-sm text-muted-foreground">{profile.homeCity}</p>
          ) : null}
          {profile?.bio ? (
            <p className="max-w-prose text-sm whitespace-pre-wrap">{profile.bio}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">名片</h2>
        {loading ? (
          <div className="flex flex-wrap gap-4">
            <Skeleton className="h-40 w-64" />
            <Skeleton className="h-40 w-64" />
          </div>
        ) : owned.length === 0 ? (
          <p className="text-sm text-muted-foreground">这位制作人还没有公开的名片。</p>
        ) : (
          <ul className="flex flex-wrap items-start gap-4">
            {owned.map((card) => (
              <li key={card.id} className="w-fit max-w-full">
                <button
                  type="button"
                  className="block w-fit max-w-full overflow-hidden rounded-xl border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={`查看制作人名片 ${card.cardNumber} 正面`}
                  onClick={() => setOpenCard(card)}
                >
                  <img
                    src={card.image1_url}
                    alt={`制作人名片 ${card.cardNumber} 正面`}
                    className="block h-auto w-auto max-w-full"
                  />
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 w-full"
                  disabled
                  title="暂未开放"
                >
                  交换
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NamecardDetailDialog
        card={openCard}
        canClaim={false}
        reactions={{
          reactions: openCard ? (reactions[openCard.id] ?? {}) : {},
          loading: Boolean(openCard && !reactions[openCard.id]),
        }}
        busy={false}
        onOpenChange={(open) => {
          if (!open) setOpenCard(null)
        }}
        onOpenPreview={() => undefined}
        onClaim={() => undefined}
        onSupplement={() => undefined}
        onReact={() => Promise.resolve(false)}
        onReturnFocus={() => undefined}
      />
    </PageShell>
  )
}
