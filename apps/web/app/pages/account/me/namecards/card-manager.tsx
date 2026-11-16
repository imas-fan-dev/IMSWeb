import { FileImageIcon, PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import type { FudabaOwnerCard, NamecardCardLayout } from "~/lib/api"
import { cn } from "~/lib/utils"
import {
  applyLayout,
  buildCardGroups,
  cardGroupKey,
  flattenCardGroups,
  quickCardIdSet,
} from "./card-manager-model"
import { CardTile, cardTileGridClassName } from "./card-tile"
import { CardGroupSection } from "./components/card-group-section"
import {
  CardManagerToolbar,
  type CardManagerViewMode,
} from "./components/card-manager-toolbar"
import { useCollapsedCardGroups } from "./hooks/use-collapsed-card-groups"

/**
 * 属主名片管理器：工具栏 + 分组 + 瓦片。
 *
 * 分组与顺序都以服务端归一后的布局为准（§4.1）：这里只做展示合成，不改数据。
 * 分组模式下每个分组有组头与折叠；经典模式只是不渲染组头、把同一份顺序展平，
 * 两种状态的切换走 View Transition（不支持时立即切换，见 `applyLayout`）。
 */
export function CardManager({
  cards,
  layout,
  accountId,
  selectedCardId,
  readOnly,
  onSelect,
  onCreate,
}: {
  cards: FudabaOwnerCard[]
  /** 服务端归一后的布局；读失败时为 `null`，退化成「只有默认分组」。 */
  layout: NamecardCardLayout | null
  /** 折叠状态按账号隔离存在本地。 */
  accountId: string | null
  selectedCardId: string | null
  readOnly: boolean
  onSelect: (cardId: string) => void
  onCreate: () => void
}) {
  const [mode, setMode] = useState<CardManagerViewMode>("grouped")
  const groups = useMemo(() => buildCardGroups(cards, layout), [cards, layout])
  const flatCards = useMemo(() => flattenCardGroups(groups), [groups])
  const quickCardIds = useMemo(
    () => quickCardIdSet(cards, layout),
    [cards, layout]
  )
  const { collapsedKeys, toggleCollapsed } = useCollapsedCardGroups(accountId)

  const renderTile = (card: FudabaOwnerCard) => (
    <CardTile
      key={card.id}
      card={card}
      inQuickExchange={quickCardIds.has(card.id)}
      selected={selectedCardId === card.id}
      onSelect={() => onSelect(card.id)}
    />
  )

  function changeMode(next: CardManagerViewMode) {
    // 用函数式更新读取「当前」模式：View Transition 会把提交推迟到回调里，
    // 同一帧内连点两下时闭包里的 `mode` 还是旧值，闭包守卫会误判。
    applyLayout(() => setMode((current) => (current === next ? current : next)))
  }

  function toggleGroup(key: string) {
    applyLayout(() => toggleCollapsed(key))
  }

  // 分组模式保留组头与折叠；经典模式只换容器，瓦片顺序（`flattenCardGroups`）不变。
  // 两种模式共用一个具名容器：e2e 与读屏都靠「我的名片清单」找到整个列表。
  const cardList =
    mode === "grouped" ? (
      <nav className="mt-4 flex flex-col gap-6" aria-label="我的名片清单">
        {groups.map((group) => {
          const key = cardGroupKey(group)
          return (
            <CardGroupSection
              key={key}
              group={group}
              collapsed={collapsedKeys.has(key)}
              onToggleCollapsed={() => toggleGroup(key)}
            >
              {group.cards.map(renderTile)}
            </CardGroupSection>
          )
        })}
      </nav>
    ) : (
      <nav
        className={cn("mt-4", cardTileGridClassName)}
        aria-label="我的名片清单"
      >
        {flatCards.map(renderTile)}
      </nav>
    )

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
        {cards.length ? (
          <CardManagerToolbar
            mode={mode}
            onModeChange={changeMode}
            readOnly={readOnly}
            onCreate={onCreate}
          />
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={readOnly}
            onClick={onCreate}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            新建名片
          </Button>
        )}
      </div>

      {cards.length ? (
        cardList
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
