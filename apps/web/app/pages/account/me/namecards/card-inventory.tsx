import { FileImageIcon, PlusIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import type { FudabaOwnerCard } from "~/lib/api"
import { CardTile } from "./card-tile"

export function CardInventory({
  cards,
  selectedCardId,
  readOnly,
  quickCardIds,
  onSelect,
  onCreate,
}: {
  cards: FudabaOwnerCard[]
  selectedCardId: string | null
  readOnly: boolean
  /** 已在快速交换清单里的卡片 id；拿到清单之前传空集合即可。 */
  quickCardIds?: ReadonlySet<string>
  onSelect: (cardId: string) => void
  onCreate: () => void
}) {
  return (
    <section aria-labelledby="owned-card-list-title">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="owned-card-list-title" className="text-base font-medium">
            我的名片
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {cards.length} 张名片
          </p>
        </div>
        <Button type="button" size="sm" disabled={readOnly} onClick={onCreate}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          新建名片
        </Button>
      </div>

      {cards.length ? (
        <nav
          className="mt-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          aria-label="我的名片清单"
        >
          {cards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              inQuickExchange={quickCardIds?.has(card.id) ?? false}
              selected={selectedCardId === card.id}
              onSelect={() => onSelect(card.id)}
            />
          ))}
        </nav>
      ) : (
        <Empty className="mt-4 min-h-44 border-y">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileImageIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>还没有交换名片</EmptyTitle>
            <EmptyDescription>
              {readOnly
                ? "名片创建开放后，可以在这里建立双面名片。"
                : "建立第一张双面名片，保存后会先进入草稿状态。"}
            </EmptyDescription>
          </EmptyHeader>
          {!readOnly ? (
            <Button type="button" variant="outline" onClick={onCreate}>
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              新建名片
            </Button>
          ) : null}
        </Empty>
      )}
    </section>
  )
}
