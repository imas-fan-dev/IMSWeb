import { useEffect, useState } from "react"
import { useParams } from "react-router"

import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { namecardPages } from "~/components/shared/namecard-pages"
import {
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
import { CARD_SHARE_UNAVAILABLE_MESSAGE, cardShareStatus } from "./share-status"

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
  }, [slug])

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

  return (
    <SharePageShell
      displayName={share.owner.displayName}
      profileHref={shareOwnerProfileHref(share.owner)}
      description="分享了这张名片"
      preview={<CardCarousel slides={slides} />}
      status={cardShareStatus({ state: share.state, loggedIn, collected })}
      currentPath={cardSharePath(slug)}
    />
  )
}
