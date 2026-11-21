import { QrCodeIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useParams } from "react-router"

import { ExchangeCardPickerDialog } from "~/components/community/exchange/exchange-card-picker-dialog"
import { useExchangeSubmit } from "~/components/community/exchange/use-exchange-submit"
import {
  PlatformSessionProvider,
  useOptionalPlatformSession,
} from "~/components/platform/platform-session-provider"
import { namecardPages } from "~/components/shared/namecard-pages"
import {
  commitScanSession,
  getScanLandingPage,
  type NamecardScanLanding,
} from "~/lib/api"
import { scanSharePath, shareOwnerProfileHref } from "~/lib/namecards/share-links"

import { CardCarousel, type CardCarouselSlide } from "./card-carousel"
import { SharePageError, SharePageShell, SharePageSkeleton } from "./share-page-shell"
import {
  SCAN_LANDING_INVALID_MESSAGE,
  scanLandingStatus,
  shareCountDescription,
} from "./share-status"

export function meta() {
  return [{ title: "面对面交换 | IMSWeb" }]
}

/**
 * 扫码落地页 `/exchange/scan/<token>`：用分享页框架展示出示方与本次名片，
 * 让扫码方先看清楚再决定要不要交换。
 *
 * 与分享页同口径：匿名可预览，登录后才能提交；已用 / 过期时接口不再给名片，
 * 页面只保留状态文案。一次性规则由后端保证，这里只负责把状态说清楚。
 */
export default function ScanSharePage() {
  return (
    <PlatformSessionProvider>
      <ScanSharePageContent />
    </PlatformSessionProvider>
  )
}

function ScanSharePageContent() {
  const { token = "" } = useParams<{ token: string }>()
  const platform = useOptionalPlatformSession()
  const [landing, setLanding] = useState<NamecardScanLanding | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const exchange = useExchangeSubmit({ onSettled: () => setReload((n) => n + 1) })

  useEffect(() => {
    let active = true
    void getScanLandingPage(token)
      .send()
      .then((next) => {
        if (!active) return
        setLanding(next)
        setMissing(false)
      })
      .catch(() => {
        if (!active) return
        setLanding(null)
        setMissing(true)
      })
      .finally(() => {
        if (active) setLoadedFor(token)
      })
    return () => {
      active = false
    }
  }, [token, reload])

  if (loadedFor !== token) return <SharePageSkeleton />
  if (missing || !landing) {
    return <SharePageError message={SCAN_LANDING_INVALID_MESSAGE} />
  }

  const loggedIn =
    platform.status === "authenticated" || platform.status === "restricted"
  const state = landing.state
  const status = scanLandingStatus({ state, loggedIn })
  const slides: CardCarouselSlide[] = landing.cards.map((card) => {
    const front = namecardPages(card)[0]
    return {
      key: String(card.id),
      url: front?.url ?? "",
      alt: `制作人名片 ${card.cardNumber} 正面`,
      badge: card.collected === true ? "已拥有" : null,
    }
  })
  const exchangeReady = state === "active" && loggedIn

  return (
    <>
      <SharePageShell
        displayName={landing.owner?.displayName ?? "面对面交换"}
        profileHref={
          landing.owner
            ? shareOwnerProfileHref({
                pageSlug: landing.owner.pageSlug,
                uid: landing.owner.uid,
              })
            : undefined
        }
        description={
          landing.cards.length > 0
            ? shareCountDescription(landing.cards.length)
            : "一次性交换二维码"
        }
        preview={
          slides.length > 0 ? (
            <CardCarousel slides={slides} />
          ) : (
            // 终态只留状态文案：这里放一个中性图，避免同一句话在页面出现两次。
            <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed text-muted-foreground">
              <QrCodeIcon className="size-10" aria-hidden="true" />
            </div>
          )
        }
        status={status}
        exchange={
          exchangeReady
            ? {
                disabled: exchange.submitting,
                onClick: () => setPickerOpen(true),
              }
            : { disabled: true, title: status.message }
        }
        currentPath={scanSharePath(token)}
      />
      <ExchangeCardPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        target={landing.owner?.accountId}
        targetMissingCount={landing.targetMissingCount}
        onSubmit={(cardNumbers) => {
          void exchange.submit((clientExchangeId) =>
            commitScanSession(token, {
              clientExchangeId,
              giveCardNumbers: cardNumbers,
            })
          )
        }}
      />
    </>
  )
}
