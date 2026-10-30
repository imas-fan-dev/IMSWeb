import {
  CircleAlertIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  NamecardWallFields,
  wallCardDraftFromCard,
  wallCardChanged,
  wallCardPayload,
  type WallCardDraft,
} from "~/components/community/namecard-wall-fields"
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
import { Field, FieldLabel } from "~/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
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

  const series = (catalog?.agencies ?? []).map((agency) => ({
    code: agency.code,
    displayName: agency.name,
    color: agency.color,
  }))
  const existingTarget = ownerCards.find((item) => item.id === targetCardId)
  const targetItems = [
    { value: NEW_CARD_VALUE, label: "创建一张可管理的注册名片" },
    ...ownerCards.map((ownerCard) => ({
      value: ownerCard.id,
      label: `绑定到 ${ownerCard.producerName}`,
    })),
  ]
  const authenticated = platform.status === "authenticated"
  const restricted = platform.status === "restricted"
  const ready = Boolean(card && draft && authenticated && catalog)
  const binding = existingTarget !== undefined
  const changed = Boolean(
    draft && live && wallCardChanged("claim", draft, live)
  )
  const canSubmit = ready && !submitting && (binding || changed)

  async function submit() {
    if (!card || !draft || !live || !canSubmit) return
    setSubmitting(true)
    try {
      const result = await createFudabaLegacyCardClaim(card.id, {
        targetCardId: binding ? existingTarget.id : null,
        // 绑定已有名片时信息以那张卡为准，所以只提交归属关系。
        payload: binding ? undefined : wallCardPayload("claim", draft, live),
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
          {!authenticated ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{restricted ? "帐号当前受限" : "请先登录"}</AlertTitle>
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
              <Field>
                <FieldLabel htmlFor="claim-target-card">绑定方式</FieldLabel>
                <Select
                  value={targetCardId}
                  items={targetItems}
                  onValueChange={(value) =>
                    setTargetCardId(String(value ?? NEW_CARD_VALUE))
                  }
                >
                  <SelectTrigger id="claim-target-card" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      <SelectItem value={NEW_CARD_VALUE}>
                        创建一张可管理的注册名片
                      </SelectItem>
                      {ownerCards.map((ownerCard) => (
                        <SelectItem key={ownerCard.id} value={ownerCard.id}>
                          绑定到 {ownerCard.producerName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

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
                  draft={draft}
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
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
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
