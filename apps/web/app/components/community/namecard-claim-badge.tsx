import { ShieldCheckIcon } from "lucide-react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Badge } from "~/components/ui/badge"
import type { Namecard } from "~/lib/api"

/**
 * 两处元信息行的排版本来就不同，组件只共用「显示哪一种徽标 + 文案」：
 * - `card`：社区列表把徽标顶到行末，窄屏允许折行，md 起用 muted。
 * - `inline`：详情弹窗跟在名片编号后面，认领徽标 muted，审核中徽标用默认色。
 */
const CARD_BADGE_CLASS =
  "ml-auto h-auto min-h-5 max-w-full whitespace-normal md:h-6 md:px-2.5 md:whitespace-nowrap md:text-muted-foreground"

function badgeClassName(
  layout: "card" | "inline",
  muted: boolean
): string | undefined {
  if (layout === "card") return CARD_BADGE_CLASS
  return muted ? "text-muted-foreground" : undefined
}

/**
 * 认领优先于补充：已认领 > 认领审核中 > 补充审核中。
 * 认领人已注册时徽标链接到其主页；三种状态都没有就不渲染。
 */
export function NamecardClaimBadge({
  card,
  layout = "card",
}: {
  card: Namecard
  layout?: "card" | "inline"
}) {
  if (card.claimStatus === "claimed") {
    return (
      <Badge
        variant="outline"
        className={badgeClassName(layout, true)}
        render={
          card.claimerUid ? (
            <NavigationLink to={`/user/${card.claimerUid}`} />
          ) : undefined
        }
      >
        <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
        {card.claimerName ?? "已由注册用户认领"}
      </Badge>
    )
  }
  if (card.claimStatus === "pending") {
    return (
      <Badge variant="outline" className={badgeClassName(layout, false)}>
        认领审核中
      </Badge>
    )
  }
  if (card.supplementPending) {
    return (
      <Badge variant="outline" className={badgeClassName(layout, false)}>
        补充审核中
      </Badge>
    )
  }
  return null
}
