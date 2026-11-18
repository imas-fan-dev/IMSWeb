import { useEffect, useState } from "react"
import { useParams } from "react-router"

import { ExchangeCardPickerDialog } from "~/components/community/exchange/exchange-card-picker-dialog"
import { useExchangeSubmit } from "~/components/community/exchange/use-exchange-submit"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { namecardPages } from "~/components/shared/namecard-pages"
import {
  commitQuickExchange,
  getQuickExchangePage,
  type NamecardQuickExchange,
} from "~/lib/api"
import { quickSharePath, shareOwnerProfileHref } from "~/lib/namecards/share-links"

import { CardCarousel, type CardCarouselSlide } from "./card-carousel"
import {
  SharePageError,
  SharePageShell,
  SharePageSkeleton,
} from "./share-page-shell"
import {
  QUICK_SHARE_MISSING_MESSAGE,
  quickShareStatus,
  shareCountDescription,
} from "./share-status"

export function meta() {
  return [{ title: "快速交换 | IMSWeb" }]
}

/**
 * 快速交换清单分享页 `/exchange/<handle>`：清单里当前仍可交换的名片（每张只出正面）+ 分享人信息。
 *
 * `handle` 可以是 uid、主页地址或账号 ID；找不到这位制作人时接口 404。
 */
export default function QuickSharePage() {
  const { handle = "" } = useParams<{ handle: string }>()
  const platform = useOptionalPlatformSession()
  const [share, setShare] = useState<NamecardQuickExchange | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const exchange = useExchangeSubmit({ onSettled: () => setReload((n) => n + 1) })

  useEffect(() => {
    let active = true
    void getQuickExchangePage(handle)
      .send()
      .then((next) => {
        if (!active) return
        setShare(next)
        setMissing(false)
      })
      .catch(() => {
        if (!active) return
        setShare(null)
        setMissing(true)
      })
      .finally(() => {
        if (active) setLoadedFor(handle)
      })
    return () => {
      active = false
    }
  }, [handle, reload])

  // 换 handle 时先说「还在加载」：上一位制作人的清单（或 404）等这一趟回来再换掉。
  if (loadedFor !== handle) return <SharePageSkeleton />
  if (missing || !share) {
    return <SharePageError message={QUICK_SHARE_MISSING_MESSAGE} />
  }

  const loggedIn =
    platform.status === "authenticated" || platform.status === "restricted"
  const cards = share.cards
  // 只有**全部**已拥有才算「没法再交换」；部分已拥有照旧，只是给那些卡带上角标。
  const allCollected =
    cards.length > 0 && cards.every((card) => card.collected === true)
  const slides: CardCarouselSlide[] = cards.map((card) => {
    const front = namecardPages(card)[0]
    return {
      key: String(card.id),
      url: front?.url ?? "",
      alt: `制作人名片 ${card.cardNumber} 正面`,
      badge: card.collected === true ? "已拥有" : null,
    }
  })

  // 清单为空、全部已拥有、匿名都不给提交；其余状态打开选卡窗口。
  const exchangeReady = loggedIn && cards.length > 0 && !allCollected
  const exchangeBlockedReason = allCollected
    ? "你已经拥有这些名片"
    : !loggedIn
      ? "登录后才能交换"
      : "这位制作人还没有可交换的名片"

  return (
    <>
      <SharePageShell
        displayName={share.displayName}
        profileHref={shareOwnerProfileHref({ pageSlug: handle, uid: share.uid })}
        description={shareCountDescription(share.cards.length)}
        preview={
          slides.length > 0 ? (
            <CardCarousel slides={slides} />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
              这位制作人还没有可交换的名片。
            </div>
          )
        }
        status={quickShareStatus({ loggedIn, allCollected })}
        exchange={
          exchangeReady
            ? {
                disabled: exchange.submitting,
                onClick: () => setPickerOpen(true),
              }
            : { disabled: true, title: exchangeBlockedReason }
        }
        currentPath={quickSharePath(handle)}
      />
      <ExchangeCardPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        target={share.accountId}
        targetMissingCount={share.targetMissingCount}
        onSubmit={(cardNumbers) => {
          void exchange.submit((clientExchangeId) =>
            commitQuickExchange(handle, {
              clientExchangeId,
              giveCardNumbers: cardNumbers,
            })
          )
        }}
      />
    </>
  )
}
