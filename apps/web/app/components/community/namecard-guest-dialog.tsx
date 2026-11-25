import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  NamecardWallFields,
  type WallCardDraft,
} from "~/components/community/namecard-wall-fields"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  createFudabaGuestCard,
  getPublicFudabaSeries,
  isApiError,
  type FudabaSeries,
} from "~/lib/api"
import { rotateOne, rotationPayload } from "~/lib/namecards/rotation"
import {
  CardMediaGallery,
  releaseMediaSlot,
  type MediaSlot,
} from "~/pages/account/me/namecards/card-media-gallery"

const emptyDraft: WallCardDraft = {
  producerName: "",
  producerReading: null,
  groupName: null,
  isGroupCard: false,
  madeOn: null,
  seriesCodes: [],
  favoriteCharacterIds: [],
  tags: [],
}

export function NamecardGuestDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState(emptyDraft)
  const [catalog, setCatalog] = useState<FudabaSeries[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [slots, setSlots] = useState<MediaSlot[]>([])
  const currentSlots = useRef<MediaSlot[]>([])
  const [rotations, setRotations] = useState<Record<number, number>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    void getPublicFudabaSeries()
      .send()
      .then((result) => {
        if (active) setCatalog(result.items)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => () => currentSlots.current.forEach(releaseMediaSlot), [])

  function updateSlots(next: MediaSlot[]) {
    const previous = currentSlots.current
    setRotations((current) =>
      Object.fromEntries(
        next.flatMap((slot, index) => {
          const turns = current[previous.indexOf(slot)]
          return turns ? [[index, turns]] : []
        })
      )
    )
    previous.filter((slot) => !next.includes(slot)).forEach(releaseMediaSlot)
    currentSlots.current = next
    setSlots(next)
  }

  const canSubmit =
    !!catalog &&
    !submitting &&
    slots.length > 0 &&
    draft.seriesCodes.length > 0 &&
    Boolean((draft.isGroupCard ? draft.groupName : draft.producerName)?.trim())

  async function submit() {
    if (!canSubmit) return
    const files = slots.flatMap((slot) =>
      slot.kind === "new" ? [slot.file] : []
    )
    const front = files[0]
    if (!front) return
    setSubmitting(true)
    try {
      await createFudabaGuestCard({
        ...draft,
        front,
        back: files.length > 1 ? files.at(-1) : undefined,
        images: files.slice(1, -1),
        rotations: rotationPayload(files.length, rotations),
      }).send()
      toast.success("名片已提交，审核通过后会在名片墙展示")
      onClose()
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "投稿失败，请重试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose()
      }}
    >
      <DialogContent layout="pinned" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>匿名投稿名片</DialogTitle>
          <DialogDescription>
            投稿不绑定账号，提交后无法自行修改，审核通过后才会公开展示。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <CardMediaGallery
            slots={slots}
            disabled={submitting}
            onChange={updateSlots}
            onError={(message) => toast.error(message)}
            rotations={rotations}
            onRotate={(position, direction) =>
              setRotations((current) => rotateOne(current, position, direction))
            }
          />
          {catalog ? (
            <NamecardWallFields
              mode="claim"
              draft={draft}
              series={catalog}
              disabled={submitting}
              onChange={setDraft}
            />
          ) : (
            <p role="status">
              {loadError ? "资料加载失败，请关闭后重试。" : "正在加载资料…"}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {submitting ? "正在上传…" : "提交审核"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
