import {
  CheckIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  NamecardWallFields,
  wallCardDraftFromCard,
  wallCardPayload,
  type WallCardDraft,
} from "~/components/community/namecard-wall-fields"
import {
  CardMediaPreview,
  publicMediaSlotsFromCard,
} from "~/pages/account/me/namecards/card-media-gallery"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useCardFieldFade } from "~/components/community/use-card-field-fade"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import { cn } from "~/lib/utils"
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
  createFudabaLegacyCardClaim,
  getFudabaOwnerCards,
  getWikiCatalog,
  isApiError,
  type FudabaCardClaim,
  type FudabaOwnerCard,
  type Namecard,
  type WikiPublicCatalog,
} from "~/lib/api"

const NEW_CARD_VALUE = "__new__"

export function NamecardClaimDialog({
  card,
  open,
  onOpenChange,
  onSubmitted,
}: {
  card: Namecard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: (claim: FudabaCardClaim) => void
}) {
  const platform = useOptionalPlatformSession()
  const [catalog, setCatalog] = useState<WikiPublicCatalog | null>(null)
  // 提交前只改预览；审核通过时服务端才真正旋转。
  const [rotations, setRotations] = useState<Record<number, number>>({})
  const mediaSlots = useMemo(
    () => (card ? publicMediaSlotsFromCard({ pages: card.pages }) : []),
    [card]
  )
  const [ownerCards, setOwnerCards] = useState<FudabaOwnerCard[]>([])
  const [loadError, setLoadError] = useState(false)
  const [targetCardId, setTargetCardId] = useState(NEW_CARD_VALUE)
  // 表单以墙上的名片为起点。调用方按名片挂 key，换卡即重挂，无需同步。
  const [draft, setDraft] = useState<WallCardDraft | null>(() =>
    card ? wallCardDraftFromCard(card) : null
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || platform.status !== "authenticated" || catalog) return
    let active = true
    void Promise.all([getWikiCatalog().send(), getFudabaOwnerCards().send()])
      .then(([catalogResult, cardsResult]) => {
        if (!active) return
        setCatalog(catalogResult)
        setOwnerCards(cardsResult.items)
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
  // 名片上没有制作人名称时，默认用当前帐号的显示名；用户一改就以此为准。
  const sessionName = platform.session?.profile.displayName?.trim() ?? ""
  const filled =
    draft && !draft.producerName.trim() && sessionName
      ? { ...draft, producerName: sessionName }
      : draft

  const series = (catalog?.agencies ?? []).map((agency) => ({
    code: agency.code,
    displayName: agency.name,
    color: agency.color,
  }))
  // 只有已通过审核的名片才能作为绑定目标。
  const bindable = ownerCards.filter(
    (item) => item.publicationStatus === "published"
  )
  const existingTarget = bindable.find((item) => item.id === targetCardId)
  const authenticated = platform.status === "authenticated"
  const restricted = platform.status === "restricted"
  const ready = Boolean(card && draft && authenticated && catalog)
  const binding = existingTarget !== undefined
  // Binding uses the target card as-is; rotations are dropped where the target is chosen.
  // 可绑定名片多时占满宽度会把表单顶下去，所以按详情窗口的字段样式折叠成滚动区。
  const { ref: bindScrollRef, fade: bindScrollFade } = useCardFieldFade(
    bindable.length
  )
  // 认领不再要求相对 live 有改动（可能已被他人补充完整），只拦必填项缺失。
  // 团体名片的必填项是团体名称，制作人名称可以留空。
  const requiredReady = Boolean(
    filled &&
    (filled.isGroupCard
      ? (filled.groupName ?? "").trim()
      : filled.producerName.trim()) &&
    filled.seriesCodes.length > 0
  )
  const canSubmit = ready && !submitting && (binding || requiredReady)

  async function submit() {
    if (!card || !filled || !live || !canSubmit) return
    setSubmitting(true)
    try {
      // 认领接口以「旧名片编号」定位：墙上这张卡的 id 现在是 guest-<编号>，
      // 直接当编号用在服务端会被判无效。
      const turns = (position: number) =>
        (((rotations[position] ?? 0) % 4) + 4) % 4
      const lastPosition = Math.max(mediaSlots.length - 1, 0)
      const rotationPatch = {
        ...(turns(0) ? { front: turns(0) } : {}),
        ...(lastPosition > 0 && turns(lastPosition)
          ? { back: turns(lastPosition) }
          : {}),
      }
      const result = await createFudabaLegacyCardClaim(card.cardNumber, {
        targetCardId: binding ? existingTarget.id : null,
        // 绑定已有名片时信息以那张卡为准，所以只提交归属关系与旋转。
        payload: binding
          ? Object.keys(rotationPatch).length
            ? { rotations: rotationPatch }
            : undefined
          : (() => {
              const patch = {
                ...wallCardPayload("claim", filled, live),
                ...(Object.keys(rotationPatch).length
                  ? { rotations: rotationPatch }
                  : {}),
              }
              // 没有任何改动时不带 payload，服务端按 live 资料落认领记录。
              return Object.keys(patch).length ? patch : undefined
            })(),
        message: "",
      }).send()
      onSubmitted(result.claim)
      onOpenChange(false)
      toast.success("认领申请已提交审核")
    } catch (error) {
      toast.error(
        isApiError(error) ? error.message : "认领申请提交失败，请重试"
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="pinned" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>认领名片 #{card?.id ?? ""}</DialogTitle>
          <DialogDescription>
            认领申请需要管理员审核。通过后这张名片归你所有，其余资料可以在名片编辑器里继续补充。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {card ? (
            <CardMediaPreview
              slots={mediaSlots}
              rotations={binding ? {} : rotations}
              onRotate={
                binding
                  ? undefined
                  : (position, direction) =>
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
                    ? "受限帐号可以查看名片，但不能提交认领。"
                    : "只有注册用户可以认领无主名片。"}
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
              <AlertTitle>认领资料载入失败</AlertTitle>
              <AlertDescription>请关闭对话框后重新打开。</AlertDescription>
            </Alert>
          ) : catalog && draft && live ? (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">绑定方式</legend>
                <div
                  ref={bindScrollRef}
                  data-fade={bindScrollFade}
                  data-size="tall"
                  className="card-field-scroll space-y-2"
                  role="radiogroup"
                  aria-label="绑定方式"
                >
                  <TargetOption
                    selected={targetCardId === NEW_CARD_VALUE}
                    title="创建一张可管理的注册名片"
                    description="用下面的六项资料建一张属于你的名片。"
                    onSelect={() => {
                      setTargetCardId(NEW_CARD_VALUE)
                      setRotations({})
                    }}
                  />
                  {bindable.map((ownerCard) => (
                    <TargetOption
                      key={ownerCard.id}
                      selected={targetCardId === ownerCard.id}
                      title={`名片 #${ownerCard.cardNumber} · ${ownerCard.producerName}`}
                      description={ownerCard.favoriteCharacters
                        .map((character) => character.name)
                        .join("、")}
                      thumbnail={ownerCard.frontImageUrl}
                      onSelect={() => {
                        setTargetCardId(ownerCard.id)
                        setRotations({})
                      }}
                    />
                  ))}
                </div>
                {bindable.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    你还没有已通过审核的名片，可以先创建一张。
                  </p>
                ) : null}
              </fieldset>

              {existingTarget ? (
                <Alert>
                  <ShieldCheckIcon aria-hidden="true" />
                  <AlertTitle>将绑定到已有名片</AlertTitle>
                  <AlertDescription>
                    名片资料以 {existingTarget.producerName} 这张卡为准，
                    名片墙上的反应会被合并过去。
                  </AlertDescription>
                </Alert>
              ) : (
                <NamecardWallFields
                  mode="claim"
                  draft={filled ?? draft}
                  series={series}
                  disabled={submitting}
                  onChange={setDraft}
                />
              )}
            </>
          ) : (
            <div
              className="flex h-40 items-center justify-center text-sm text-muted-foreground"
              aria-label="正在载入认领资料"
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
              <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {submitting ? "正在提交" : "提交认领审核"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 绑定目标的一行：小预览 + 编号与名称 + 说明；与 Select 不同，它不会开浮层。 */
function TargetOption({
  selected,
  title,
  description,
  thumbnail,
  onSelect,
}: {
  selected: boolean
  title: string
  description?: string
  thumbnail?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors",
        selected
          ? "border-primary/60 bg-primary/5"
          : "border-border hover:bg-muted/60"
      )}
      onClick={onSelect}
    >
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="size-full object-cover" />
        ) : (
          <PlusIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {description ? (
          <span className="block truncate text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {selected ? (
        <CheckIcon
          className="size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}
