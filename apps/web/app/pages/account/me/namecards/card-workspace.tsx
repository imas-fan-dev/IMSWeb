import { useExchangeMapDialog } from "~/pages/community/exchange/components/exchange-page-surface"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "~/components/ui/dialog"
import { FileImageIcon } from "lucide-react"


import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import type { FudabaOwnerCard, FudabaSeries, PlatformProfile } from "~/lib/api"
import { CardEditor, CardEditorHeading } from "./card-editor"
import { CardInventory } from "./card-inventory"

export function CardWorkspace({
  cards,
  selectedCardId,
  creating,
  loadingDetail,
  profile,
  series,
  readOnly,
  readOnlyReason,
  active,
  onClose,
  onSelect,
  onCreate,
  onCreated,
  onSaved,
  onDeleted,
  onReload,
  onWriteClosed,
}: {
  active: boolean
  onClose: () => void
  cards: FudabaOwnerCard[]
  selectedCardId: string | null
  creating: boolean
  loadingDetail: boolean
  profile: PlatformProfile
  series: FudabaSeries[]
  readOnly: boolean
  readOnlyReason: string | null
  onSelect: (cardId: string) => void
  onCreate: () => void
  onCreated: (card: FudabaOwnerCard) => void
  onSaved: (card: FudabaOwnerCard) => void
  onDeleted: (cardId: string) => void
  onReload: (cardId: string) => Promise<FudabaOwnerCard>
  onWriteClosed: () => void
}) {
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null

  const mapDialog = useExchangeMapDialog()
  const editor = (
    <div className="min-w-0">
      {loadingDetail && !selectedCard ? (
        <div aria-label="正在载入名片" className="flex flex-col gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="aspect-3/2 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : selectedCard || creating ? (
        <CardEditor
          key={creating ? "new" : selectedCard?.id}
          card={selectedCard}
          creating={creating}
          headerless={!mapDialog}
          profile={profile}
          series={series}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          onCreated={onCreated}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onReload={onReload}
          onWriteClosed={onWriteClosed}
        />
      ) : (
        <Empty className="min-h-80 border-y">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileImageIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>选择一张名片</EmptyTitle>
            <EmptyDescription>
              从清单选择名片以查看正反面和编辑资料。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
  const open = active && Boolean(creating || selectedCard)
  return (
    <div className="min-w-0">
      <CardInventory
        cards={cards}
        selectedCardId={selectedCardId}
        readOnly={readOnly}
        onSelect={(id) => {
          onSelect(id)
        }}
        onCreate={() => {
          onCreate()
        }}
      />
      {mapDialog ? (
        open ? (
          editor
        ) : null
      ) : (
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!value) onClose()
          }}
        >
          <DialogContent layout="pinned" className="sm:max-w-3xl">
            <DialogHeader>
              {/* 真正的标题在编辑器里，这里只保留无障碍名称。 */}
              <DialogTitle className="sr-only">
                {creating ? "新建名片" : "名片详情与编辑"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                查看双面素材与名片资料。
              </DialogDescription>
              {selectedCard || creating ? (
                <CardEditorHeading card={selectedCard} creating={creating} />
              ) : null}
            </DialogHeader>
            <DialogBody>{editor}</DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
