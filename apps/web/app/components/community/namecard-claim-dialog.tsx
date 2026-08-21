import {
  CircleAlertIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import {
  IdolMultiSelect,
  type IdolSeriesOption,
} from "~/components/community/idol-multi-select"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Dialog,
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
import { Textarea } from "~/components/ui/textarea"
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
  const [seriesCode, setSeriesCode] = useState("")
  const [favoriteIdolIds, setFavoriteIdolIds] = useState<number[]>([])
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || platform.status !== "authenticated" || catalog) return
    let active = true
    void Promise.all([getWikiCatalog().send(), getFudabaOwnerCards().send()])
      .then(([catalogResult, cardsResult]) => {
        if (!active) return
        setCatalog(catalogResult)
        setOwnerCards(cardsResult.items)
        setSeriesCode(catalogResult.agencies[0]?.code ?? "")
        setLoadError(false)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [catalog, open, platform.status])

  const series: IdolSeriesOption[] = (catalog?.agencies ?? []).map(
    (agency) => ({
      code: agency.code,
      displayName: agency.name,
      color: agency.color,
    })
  )
  const existingTarget = ownerCards.find((item) => item.id === targetCardId)
  const effectiveSeriesCode = existingTarget?.seriesCode ?? seriesCode
  const effectiveIdolIds = existingTarget
    ? existingTarget.favoriteIdols.map((idol) => idol.id)
    : favoriteIdolIds
  const authenticated = platform.status === "authenticated"
  const restricted = platform.status === "restricted"
  const ready = Boolean(
    card &&
    authenticated &&
    catalog &&
    effectiveSeriesCode &&
    effectiveIdolIds.length > 0
  )

  function selectTarget(value: unknown) {
    const next = String(value ?? NEW_CARD_VALUE)
    setTargetCardId(next)
    const target = ownerCards.find((item) => item.id === next)
    if (!target) return
    setSeriesCode(target.seriesCode)
    setFavoriteIdolIds(target.favoriteIdols.map((idol) => idol.id))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!card || !ready || submitting) return
    setSubmitting(true)
    try {
      const result = await createFudabaLegacyCardClaim(card.id, {
        targetCardId: targetCardId === NEW_CARD_VALUE ? null : targetCardId,
        seriesCode: effectiveSeriesCode,
        favoriteIdolIds: effectiveIdolIds,
        message: message.trim(),
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form className="space-y-5" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>认领历史名片 #{card?.id ?? ""}</DialogTitle>
            <DialogDescription>
              认领申请需要管理员审核。通过后名片会绑定到你的帐号，并可在地图名片墙摆放。
            </DialogDescription>
          </DialogHeader>

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
                    : "只有注册用户可以认领历史名片。"}
                </p>
                {!restricted ? (
                  <Link
                    to="/community/exchange"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    前往登录或注册
                  </Link>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : loadError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>认领资料载入失败</AlertTitle>
              <AlertDescription>请关闭对话框后重新打开。</AlertDescription>
            </Alert>
          ) : catalog ? (
            <>
              <Field>
                <FieldLabel htmlFor="claim-target-card">绑定方式</FieldLabel>
                <Select value={targetCardId} onValueChange={selectTarget}>
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
                          绑定到 {ownerCard.displayName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              {existingTarget ? (
                <Alert>
                  <ShieldCheckIcon aria-hidden="true" />
                  <AlertTitle>将绑定现有注册名片</AlertTitle>
                  <AlertDescription>
                    {existingTarget.displayName} · {existingTarget.favoriteIdol}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="claim-series">主企划</FieldLabel>
                    <Select
                      value={seriesCode}
                      onValueChange={(value) =>
                        setSeriesCode(String(value ?? ""))
                      }
                    >
                      <SelectTrigger id="claim-series" className="w-full">
                        <SelectValue placeholder="选择主企划" />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectGroup>
                          {series.map((item) => (
                            <SelectItem key={item.code} value={item.code}>
                              {item.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <IdolMultiSelect
                    id="claim-idols"
                    series={series}
                    idols={catalog.searchEntries}
                    selectedIds={favoriteIdolIds}
                    disabled={submitting}
                    onChange={setFavoriteIdolIds}
                  />
                </>
              )}

              <Field>
                <FieldLabel htmlFor="claim-message">认领说明</FieldLabel>
                <Textarea
                  id="claim-message"
                  value={message}
                  maxLength={500}
                  placeholder="可填写能帮助管理员确认归属的信息"
                  className="min-h-24"
                  onChange={(event) => setMessage(event.currentTarget.value)}
                />
              </Field>
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={!ready || submitting}>
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
        </form>
      </DialogContent>
    </Dialog>
  )
}
