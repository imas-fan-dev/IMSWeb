import { CircleAlertIcon, LoaderCircleIcon, PlusIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  NamecardWallFields,
  wallCardChanged,
  wallCardDraftFromCard,
  wallCardPayload,
  type WallCardDraft,
} from "~/components/community/namecard-wall-fields"
import {
  CardMediaPreview,
  publicMediaSlotsFromCard,
} from "~/pages/account/me/namecards/card-media-gallery"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
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
  createFudabaCardSupplement,
  getWikiCatalog,
  isApiError,
  type Namecard,
  type WikiPublicCatalog,
} from "~/lib/api"

/**
 * 名片墙上的【补充】：只更正制作人名称、团体名称、企划与担当角色。
 * 提交后进入审核队列，审核完成前这张卡不接受新的补充。
 */
export function NamecardSupplementDialog({
  card,
  open,
  onOpenChange,
  onSubmitted,
}: {
  card: Namecard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: () => void
}) {
  const platform = useOptionalPlatformSession()
  const [catalog, setCatalog] = useState<WikiPublicCatalog | null>(null)
  const [loadError, setLoadError] = useState(false)
  // 调用方按名片挂 key，换卡即重挂，草稿自然回到起点。
  const [draft, setDraft] = useState<WallCardDraft | null>(() =>
    card ? wallCardDraftFromCard(card) : null
  )
  const [submitting, setSubmitting] = useState(false)
  // 提交前只改预览；审核通过时服务端才真正旋转。
  const [rotations, setRotations] = useState<Record<number, number>>({})
  const mediaSlots = useMemo(
    () => (card ? publicMediaSlotsFromCard({ pages: card.pages }) : []),
    [card]
  )
  const turns = (position: number) => (((rotations[position] ?? 0) % 4) + 4) % 4
  const lastPosition = Math.max(mediaSlots.length - 1, 0)
  const rotationPatch = {
    ...(turns(0) ? { front: turns(0) } : {}),
    ...(lastPosition > 0 && turns(lastPosition)
      ? { back: turns(lastPosition) }
      : {}),
  }

  useEffect(() => {
    if (!open || platform.status !== "authenticated" || catalog) return
    let active = true
    void getWikiCatalog()
      .send()
      .then((result) => {
        if (!active) return
        setCatalog(result)
        setLoadError(false)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [catalog, open, platform.status])

  /** 提交时用来算出「改了哪几处」的基线，永远取墙上的现值。 */
  const live = card ? wallCardDraftFromCard(card) : null

  const series = (catalog?.agencies ?? []).map((agency) => ({
    code: agency.code,
    displayName: agency.name,
    color: agency.color,
  }))
  const authenticated = platform.status === "authenticated"
  const restricted = platform.status === "restricted"
  const changed = Boolean(
    draft && live && wallCardChanged("supplement", draft, live)
  )
  const busy = Boolean(card?.supplementPending)
  const canSubmit =
    Boolean(card && draft && live && authenticated && catalog) &&
    (changed || Object.keys(rotationPatch).length > 0) &&
    !busy &&
    !submitting

  async function submit() {
    if (!card || !draft || !live || !canSubmit) return
    setSubmitting(true)
    try {
      await createFudabaCardSupplement(card.cardId, {
        ...wallCardPayload("supplement", draft, live),
        ...(Object.keys(rotationPatch).length
          ? { rotations: rotationPatch }
          : {}),
      }).send()
      onSubmitted()
      onOpenChange(false)
      toast.success("补充已提交审核")
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "补充提交失败，请重试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="pinned" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>补充名片信息 #{card?.cardNumber ?? ""}</DialogTitle>
          <DialogDescription>
            这张名片还没有主人。你可以更正下面四项资料，管理员审核通过后会写回名片。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {card ? (
            <CardMediaPreview
              slots={mediaSlots}
              rotations={rotations}
              onRotate={(position, direction) =>
                setRotations((current) => ({
                  ...current,
                  [position]:
                    ((((current[position] ?? 0) +
                      (direction === "right" ? 1 : 3)) %
                      4) +
                      4) %
                    4,
                }))
              }
            />
          ) : null}
          {!authenticated ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>
                {restricted ? "帐号当前受限" : "请先登录"}
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  {restricted
                    ? "受限帐号可以查看名片，但不能提交补充。"
                    : "只有注册用户可以补充名片信息。"}
                </p>
                {!restricted ? (
                  <NavigationLink
                    to="/community/exchange"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    前往登录或注册
                  </NavigationLink>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : loadError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>资料载入失败</AlertTitle>
              <AlertDescription>请关闭对话框后重新打开。</AlertDescription>
            </Alert>
          ) : busy ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>这张名片已有一份补充在审核</AlertTitle>
              <AlertDescription>
                等管理员处理完这次补充后，其他人才能再次提交。
              </AlertDescription>
            </Alert>
          ) : catalog && draft && live ? (
            <NamecardWallFields
              mode="supplement"
              draft={draft}
              series={series}
              disabled={submitting}
              onChange={setDraft}
            />
          ) : (
            <div
              className="flex h-40 items-center justify-center text-sm text-muted-foreground"
              aria-label="正在载入名片资料"
            >
              <LoaderCircleIcon
                className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              正在载入
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {submitting ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {submitting ? "正在提交" : "提交补充审核"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
