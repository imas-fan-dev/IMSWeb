import { CircleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { CardImage } from "~/components/shared/card-image"
import { namecardPages } from "~/components/shared/namecard-pages"
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
import { Skeleton } from "~/components/ui/skeleton"
import {
  acceptExchange,
  declineExchange,
  getExchangeDetail,
  isApiError,
} from "~/lib/api"
import type {
  Namecard,
  NamecardExchangeDecision,
  NamecardExchangeDetail,
} from "@imsweb/contracts/namecards"

const DIALOG_TITLE = "名片交换请求"
const TARGET_SECTION_TITLE = "对方希望交换的名片"
const INITIATOR_SECTION_TITLE = "对方用于交换的名片"
const EMPTY_INITIATOR_COPY = "对方这次没有给出名片"
const READ_ONLY_COPY = "当前只读，暂时不能处理这笔交换"

/** 只读状态下的结论：三种已结束的交换各一句话。 */
const RESOLVED_COPY: Record<
  Exclude<NamecardExchangeDetail["status"], "pending">,
  string
> = {
  expired: "这笔交换已过期",
  completed: "这笔交换已完成",
  declined: "这笔交换已被婉拒",
}

type DetailState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; detail: NamecardExchangeDetail }

export interface ExchangeRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 通知行带来的交换 ID；为空时窗口不取数（正常不会发生）。 */
  exchangeId: string | null
  /** 决策落地：面板据此刷新通知列表，并让名片册 / 交换记录查询失效。 */
  onDecided?: (status: NamecardExchangeDecision["status"]) => void
  /** 写路径关闭时只读：详情照常可看，两个决策按钮禁用。 */
  readOnly?: boolean
}

/**
 * 通知里的交换详情窗：对方要哪些卡、对方给了哪些卡，pending 时就地【拒绝】【同意】。
 *
 * 内容随打开挂载（`RequestContent` 按 `exchangeId` 作 key），关窗即卸载 ——
 * 换一条通知、重开一次都是干净的新会话。已读标记由调用方（通知面板）在打开时
 * 完成，窗口不重复标记。
 */
export function ExchangeRequestDialog({
  open,
  onOpenChange,
  exchangeId,
  onDecided,
  readOnly = false,
}: ExchangeRequestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && exchangeId ? (
        <RequestContent
          key={exchangeId}
          exchangeId={exchangeId}
          readOnly={readOnly}
          onOpenChange={onOpenChange}
          onDecided={onDecided}
        />
      ) : null}
    </Dialog>
  )
}

function RequestContent({
  exchangeId,
  readOnly,
  onOpenChange,
  onDecided,
}: {
  exchangeId: string
  readOnly: boolean
  onOpenChange: (open: boolean) => void
  onDecided?: ((status: NamecardExchangeDecision["status"]) => void) | undefined
}) {
  const [state, setState] = useState<DetailState>({ kind: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [deciding, setDeciding] = useState<"accept" | "decline" | null>(null)

  useEffect(() => {
    let active = true
    getExchangeDetail(exchangeId)
      .send()
      .then((detail) => {
        if (active) setState({ kind: "ready", detail })
      })
      .catch(() => {
        if (active) setState({ kind: "failed" })
      })
    return () => {
      active = false
    }
  }, [attempt, exchangeId])

  const decide = useCallback(
    async (decision: "accept" | "decline") => {
      if (deciding) return
      setDeciding(decision)
      try {
        const method =
          decision === "accept"
            ? acceptExchange(exchangeId)
            : declineExchange(exchangeId)
        const result = await method.send()
        onOpenChange(false)
        onDecided?.(result.status)
      } catch (error) {
        toast.error(decisionFailureCopy(error))
      } finally {
        setDeciding(null)
      }
    },
    [deciding, exchangeId, onDecided, onOpenChange]
  )

  const detail = state.kind === "ready" ? state.detail : null
  const pending = detail?.status === "pending"
  const startedAt = detail?.createdAt.slice(0, 16).replace("T", " ") ?? ""
  const expiresAt = detail?.expiresAt?.slice(0, 16).replace("T", " ") ?? null

  return (
    <DialogContent layout="pinned" className="max-w-md">
      <DialogHeader>
        <DialogTitle>{DIALOG_TITLE}</DialogTitle>
        <DialogDescription>
          {detail
            ? `${detail.initiator.displayName} 希望与你交换名片`
            : "交换申请的卡片与说明"}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        {state.kind === "loading" ? (
          <DialogSkeleton />
        ) : state.kind === "failed" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CircleAlertIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">交换详情加载失败。</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setState({ kind: "loading" })
                setAttempt((current) => current + 1)
              }}
            >
              重试
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              发起于 {startedAt}
              {expiresAt ? ` · 有效期至 ${expiresAt}` : ""}
            </p>
            <ExchangeCardSection
              title={TARGET_SECTION_TITLE}
              cards={state.detail.targetCards}
              emptyLabel="对方没有指定名片"
            />
            <ExchangeCardSection
              title={INITIATOR_SECTION_TITLE}
              cards={state.detail.initiatorCards}
              emptyLabel={EMPTY_INITIATOR_COPY}
            />
          </>
        )}
      </DialogBody>

      <DialogFooter>
        {pending ? (
          <>
            {readOnly ? (
              <p className="text-xs text-muted-foreground sm:mr-auto">
                {READ_ONLY_COPY}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={deciding !== null || readOnly}
              onClick={() => void decide("decline")}
            >
              {deciding === "decline" ? "处理中" : "拒绝"}
            </Button>
            <Button
              type="button"
              disabled={deciding !== null || readOnly}
              onClick={() => void decide("accept")}
            >
              {deciding === "accept" ? "处理中" : "同意"}
            </Button>
          </>
        ) : (
          <>
            {detail && detail.status !== "pending" ? (
              <p className="text-sm text-muted-foreground sm:mr-auto">
                {RESOLVED_COPY[detail.status]}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              关闭
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

/** 一块 1:1 网格：标题 + 纯图瓦片（卡号在 `alt` 里）；没有卡时留一行说明。 */
function ExchangeCardSection({
  title,
  cards,
  emptyLabel,
}: {
  title: string
  cards: readonly Namecard[]
  emptyLabel: string
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {cards.length ? (
        <ul className="grid grid-cols-4 gap-2">
          {cards.map((card) => (
            <li
              key={card.cardId}
              className="flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-lg border bg-background p-2"
            >
              <CardImage
                src={namecardPages(card)[0]?.thumb}
                alt={`名片 #${card.cardNumber}`}
                loading="lazy"
                className="max-h-full max-w-full border border-foreground/25 object-contain"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </section>
  )
}

/** 加载骨架：两块网格各占一排，详情回来时高度不跳。 */
function DialogSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-3 w-40 rounded-md" />
      {Array.from({ length: 2 }, (_, section) => (
        <div key={section} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24 rounded-md" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }, (_, tile) => (
              <Skeleton key={tile} className="aspect-square rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 父 design §4.3 的错误表：409 一律按「已过期」处理，其余给可重试的兜底。 */
function decisionFailureCopy(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 409) return "这条交换请求已过期"
    if (error.status === 404) return "找不到这条交换请求"
    if (error.status === 401) return "登录已过期，请重新登录后再试"
    if (error.kind === "network") return "网络连接失败，请稍后重试"
  }
  return "交换处理失败，请稍后重试"
}
