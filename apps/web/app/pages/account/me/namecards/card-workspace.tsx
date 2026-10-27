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

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import type { FudabaOwnerCard, FudabaSeries, PlatformProfile } from "~/lib/api"
import { CardEditor } from "./card-editor"
import { CardInventory } from "./card-inventory"

/** What happened to the revision that is not published yet, and what is live. */
function RevisionNotice({ card }: { card: FudabaOwnerCard }) {
  const status = card.reviewStatus
  if (!status) return null
  const title =
    status === "pending"
      ? "新版本审核中"
      : status === "locked"
        ? "本次提交已被标记违规"
        : "新版本未通过审核"
  const description =
    status === "pending"
      ? "审核期间名片墙上仍然展示上一个已公开的版本；通过后会自动替换。"
      : status === "locked"
        ? `违规理由：${card.reviewReason ?? "未填写"}。名片墙上仍然展示上一个已公开的版本。`
        : `驳回理由：${card.reviewReason ?? "未填写"}。名片墙上仍然展示上一个已公开的版本，可以修改后重新提交。`
  return (
    <Alert
      className="mb-4"
      variant={status === "pending" ? undefined : "destructive"}
    >
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  )
}

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
      {selectedCard?.reviewStatus ? (
        <RevisionNotice card={selectedCard} />
      ) : null}
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
              <DialogTitle>
                {creating ? "新建名片" : "名片详情与编辑"}
              </DialogTitle>
              <DialogDescription>查看双面素材与名片资料。</DialogDescription>
            </DialogHeader>
            <DialogBody>{editor}</DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
