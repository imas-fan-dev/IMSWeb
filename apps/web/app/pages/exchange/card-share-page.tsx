import { useEffect, useState } from "react"
import { useParams } from "react-router"

import { ExchangeCardPickerDialog } from "~/components/community/exchange/exchange-card-picker-dialog"
import { useExchangeSubmit } from "~/components/community/exchange/use-exchange-submit"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { namecardPages } from "~/components/shared/namecard-pages"
import {
  commitCardShare,
  getCardSharePage,
  type NamecardCardShare,
} from "~/lib/api"
import { cardSharePath, shareOwnerProfileHref } from "~/lib/namecards/share-links"

import { CardCarousel, type CardCarouselSlide } from "./card-carousel"
import {
  SharePageError,
  SharePageShell,
  SharePageSkeleton,
} from "./share-page-shell"
import {
  CARD_SHARE_UNAVAILABLE_MESSAGE,
  cardShareStatus,
  shareCountDescription,
} from "./share-status"

export function meta() {
  return [{ title: "名片分享 | IMSWeb" }]
}

/**
 * 单卡分享页 `/exchange/card/<slug>`：名片正面（逐页轮播）+ 分享人信息 + 【交换】按钮。
 *
 * 取数照抄主页那一套（`alova` + `useEffect`，不用 loader）：卡片不存在 / 未认领 /
 * 被下线时接口一律 404，这里只渲染一句「这张名片当前不开放交换」，不解释原因。
 */
export default function CardSharePage() {
  const { slug = "" } = useParams<{ slug: string }>()
  const platform = useOptionalPlatformSession()
  const [share, setShare] = useState<NamecardCardShare | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const exchange = useExchangeSubmit({ onSettled: () => setReload((n) => n + 1) })

  useEffect(() => {
    let active = true
    void getCardSharePage(slug)
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
        if (active) setLoadedFor(slug)
      })
    return () => {
      active = false
    }
  }, [slug, reload])

  // 换 slug 时先说「还在加载」：上一张卡的数据（或 404）等这一趟回来再换掉。
  if (loadedFor !== slug) return <SharePageSkeleton />
  if (missing || !share) {
    return <SharePageError message={CARD_SHARE_UNAVAILABLE_MESSAGE} />
  }

  const card = share.card
  const loggedIn =
    platform.status === "authenticated" || platform.status === "restricted"
  const collected = card.collected === true
  const slides: CardCarouselSlide[] = namecardPages(card).map((page) => ({
    key: page.key,
    url: page.url,
    alt: `制作人名片 ${card.cardNumber} ${page.label}`,
    badge: collected ? "已拥有" : null,
  }))

  // 只有「这张还能交换 + 已登录 + 还没拥有」才可点；其余保持 disabled，用 title 说明原因。
  const exchangeReady = share.state === "available" && loggedIn && !collected
  const exchangeBlockedReason =
    share.state === "own-card"
      ? "这是你自己的名片"
      : share.state === "not-accepting"
        ? "这张名片不接受交换"
        : !loggedIn
          ? "登录后才能交换"
          : "你已经拥有这张名片"

  return (
    <>
      <SharePageShell
        displayName={share.owner.displayName}
        profileHref={shareOwnerProfileHref(share.owner)}
        description={shareCountDescription(1)}
        preview={<CardCarousel slides={slides} />}
        status={cardShareStatus({ state: share.state, loggedIn, collected })}
        exchange={
          exchangeReady
            ? {
                disabled: exchange.submitting,
                onClick: () => setPickerOpen(true),
              }
            : { disabled: true, title: exchangeBlockedReason }
        }
        currentPath={cardSharePath(slug)}
      />
      <ExchangeCardPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        target={share.owner.accountId}
        targetMissingCount={share.targetMissingCount}
        onSubmit={(cardNumbers) => {
          void exchange.submit((clientExchangeId) =>
            commitCardShare(slug, {
              clientExchangeId,
              giveCardNumbers: cardNumbers,
            })
          )
        }}
      />
    </>
  )
}
