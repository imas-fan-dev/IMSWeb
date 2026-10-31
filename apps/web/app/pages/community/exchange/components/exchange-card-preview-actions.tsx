import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import type { FudabaCard } from "~/lib/api"
import { CardInteractionBar } from "./exchange-card-interactions"
import { ExchangeManagementDialog } from "./exchange-management-dialog"

export function ExchangeCardPreviewActions({ card }: { card: FudabaCard }) {
  const platform = useOptionalPlatformSession()
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg bg-background/95 p-2">
      <CardInteractionBar card={card} />
      {platform.status === "authenticated" ||
      platform.status === "restricted" ? (
        <ExchangeManagementDialog section="namecards" cardId={card.id} />
      ) : null}
    </div>
  )
}
