import { LoaderCircleIcon, XIcon } from "lucide-react"
import { useCallback, useState } from "react"

import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import { useDesktopAccountWorkspace } from "~/lib/use-desktop-account-workspace"

import {
  ExchangeCardPickerGrid,
  ExchangeCardPickerSkeletonGrid,
} from "./exchange-card-picker-grid"
import {
  canConfirmPicker,
  needsEmptyGiveConfirm,
  pickerCountLabel,
  type ExchangeCardPickerVariant,
  type PickerGroup,
} from "./exchange-card-picker-model"
import {
  useExchangeCardPicker,
  type ExchangeCardPickerStatus,
} from "./use-exchange-card-picker"

/** 标题与说明文案：默认模式是「选卡」，扫码模式强调接下来要出示二维码，送片模式说明是单向给。 */
const PICKER_COPY: Record<
  ExchangeCardPickerVariant,
  { title: string; description: string }
> = {
  confirm: {
    title: "交换名片",
    description: "请选择用于本次交换的名片。",
  },
  "scan-share": {
    title: "扫码交换",
    description: "选择要交给对方的名片，然后分享二维码。",
  },
  gift: {
    title: "发送名片",
    description: "选择要送给对方的名片，直接放进对方的名片册。",
  },
}

/** 退出即丢弃本次选择；PC 的右上角 X 与移动端 Sheet 的关闭共用这一句话。 */
const PICKER_EXIT_LABEL = "退出交换"
const EMPTY_GIVE_CONFIRM_TITLE = "确认一张都不给？"

export interface ExchangeCardPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 目标账号；未知（App 出示二维码之前）时省略，窗口不做「对方已有」标记。 */
  target?: string | undefined
  /** 目标卡号：名片墙只剩卡号时用它（与 `target` 只传一个）。 */
  targetCard?: number | undefined
  /** 「确定」前的二次确认用（来自分享页/快速页响应）；未知时省略。 */
  targetMissingCount?: number | undefined
  /** 底部控件形态：默认【取消】【确定】，App 出示二维码场合是【扫码】【分享】，送片同默认但必须至少选 1 张。 */
  variant?: ExchangeCardPickerVariant
  /**
   * 写请求在途：底部两个按钮一起禁用，【确定】显示 busy。
   * 只有送片（gift）用得上 —— 它在请求落定前不关窗，失败后还能改选重试。
   */
  submitting?: boolean
  /** 【确定】/【分享】：窗口只交出编号，登记交换是接入方的事。 */
  onSubmit: (cardNumbers: number[]) => void
  /** 【扫码】：给出当前选择（可以为空），由接入方接扫码器。 */
  onScan?: (cardNumbers: number[]) => void
}

/**
 * 选卡窗口：从**自己全部已发布的名片**里挑出本轮要交出的那几张。
 *
 * 外壳按账号工作区的断点分叉（2026-11-18 裁决）：PC 用 `Dialog layout="pinned"`，
 * 右上角是【退出交换】；窄屏用底部 `Sheet`，两者共用同一个内容组件。四种入口
 * （名片墙 / 主页 / 分享页 / 扫码）都只负责打开它、传目标与提交回调。
 *
 * 选择与取数都挂在 `open` 为真的那份子树上：关闭即卸载，重开就是一次干净的新会话。
 * 窗口不碰任何交换接口 —— 确定 / 分享 / 扫码都只是把编号交回接入方然后关闭自己。
 */
export function ExchangeCardPickerDialog({
  open,
  onOpenChange,
  target,
  targetCard,
  targetMissingCount,
  variant = "confirm",
  submitting = false,
  onSubmit,
  onScan,
}: ExchangeCardPickerDialogProps) {
  const desktop = useDesktopAccountWorkspace()
  const copy = PICKER_COPY[variant]
  const exitLabel = variant === "gift" ? "关闭" : PICKER_EXIT_LABEL

  // 送片不在这里关窗：请求落定前窗口要显示 busy，成功后由接入方关（失败还能改选）。
  const keepsOpenOnSubmit = variant === "gift"

  const submit = useCallback(
    (cardNumbers: readonly number[]) => {
      onSubmit([...cardNumbers])
      if (!keepsOpenOnSubmit) onOpenChange(false)
    },
    [keepsOpenOnSubmit, onOpenChange, onSubmit]
  )

  const scan = useCallback(
    (cardNumbers: readonly number[]) => {
      onScan?.([...cardNumbers])
      onOpenChange(false)
    },
    [onOpenChange, onScan]
  )

  const exit = useCallback(() => onOpenChange(false), [onOpenChange])

  const panel = open ? (
    <PickerPanel
      target={target}
      targetCard={targetCard}
      targetMissingCount={targetMissingCount}
      variant={variant}
      submitting={submitting}
      onSubmit={submit}
      onScan={scan}
      onCancel={exit}
    />
  ) : null

  return desktop ? (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layout="pinned"
        showCloseButton={false}
        className="max-w-sm sm:max-w-md"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 max-sm:size-11"
              title={exitLabel}
            />
          }
        >
          <XIcon />
          <span className="sr-only">{exitLabel}</span>
        </DialogClose>
        {panel}
      </DialogContent>
    </Dialog>
  ) : (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-sm gap-3 p-4 sm:max-w-md"
      >
        <SheetHeader className="p-0 pr-8">
          <SheetTitle>{copy.title}</SheetTitle>
          <SheetDescription>{copy.description}</SheetDescription>
        </SheetHeader>
        <SheetClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3"
              title={exitLabel}
            />
          }
        >
          <XIcon />
          <span className="sr-only">{exitLabel}</span>
        </SheetClose>
        {panel}
      </SheetContent>
    </Sheet>
  )
}

/**
 * 一次打开会话的完整内容：取数、选择、二次确认都在这里，随窗口关闭一起卸载。
 *
 * `onSubmit` / `onScan` 由外壳收尾（关窗）；这里只决定「这一下到底提交什么」。
 */
function PickerPanel({
  target,
  targetCard,
  targetMissingCount,
  variant,
  submitting,
  onSubmit,
  onScan,
  onCancel,
}: {
  target?: string | undefined
  targetCard?: number | undefined
  targetMissingCount?: number | undefined
  variant: ExchangeCardPickerVariant
  submitting: boolean
  onSubmit: (cardNumbers: readonly number[]) => void
  onScan: (cardNumbers: readonly number[]) => void
  onCancel: () => void
}) {
  // 送片从零开始挑，不预勾快速清单；其它入口沿用快速清单。
  const picker = useExchangeCardPicker({
    target,
    targetCard,
    autoSelect: variant !== "gift",
  })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const missingCount = targetMissingCount ?? picker.targetMissingCount

  // 0 张、对方还缺卡：先问一句「一张都不给吗」，确认后才真的提交空清单。
  const confirm = useCallback(() => {
    if (needsEmptyGiveConfirm(picker.selected, missingCount)) {
      setConfirmOpen(true)
      return
    }
    onSubmit(picker.selected)
  }, [missingCount, onSubmit, picker.selected])

  return (
    <>
      <PickerContent
        status={picker.status}
        isEmpty={picker.isEmpty}
        groups={picker.groups}
        selected={picker.selected}
        limit={picker.limit}
        variant={variant}
        submitting={submitting}
        onToggle={picker.toggle}
        onClear={picker.clear}
        onRetry={picker.retry}
        onCancel={onCancel}
        onConfirm={confirm}
        onScan={() => onScan(picker.selected)}
      />
      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={EMPTY_GIVE_CONFIRM_TITLE}
        description={`你还有 ${missingCount} 张对方没有的名片，确定一张都不给吗？`}
        submitting={false}
        confirmLabel="确定"
        variant="default"
        onConfirm={() => {
          setConfirmOpen(false)
          onSubmit(picker.selected)
        }}
      />
    </>
  )
}

/**
 * 两个外壳共用的内容：计数与【清空】/ 滚动区 / 底部固定控件区。
 *
 * 按钮只回传意图（取消 / 确定 / 扫码），提交、二次确认与关闭都由外层决定。
 */
function PickerContent({
  status,
  isEmpty,
  groups,
  selected,
  limit,
  variant,
  submitting,
  onToggle,
  onClear,
  onRetry,
  onCancel,
  onConfirm,
  onScan,
}: {
  status: ExchangeCardPickerStatus
  isEmpty: boolean
  groups: readonly PickerGroup[]
  selected: readonly number[]
  limit: number | null
  variant: ExchangeCardPickerVariant
  submitting: boolean
  onToggle: (cardNumber: number) => void
  onClear: () => void
  onRetry: () => void
  onCancel: () => void
  onConfirm: () => void
  onScan: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {limit === null ? "已选 —" : `已选 ${pickerCountLabel(selected, limit)}`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={selected.length === 0}
          onClick={onClear}
        >
          清空
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-px">
        <PickerBody
          status={status}
          isEmpty={isEmpty}
          groups={groups}
          selected={selected}
          onToggle={onToggle}
          onRetry={onRetry}
        />
      </div>
      <div className="flex shrink-0 gap-2">
        {variant === "scan-share" ? (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onScan}
          >
            扫码
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={submitting}
            onClick={onCancel}
          >
            取消
          </Button>
        )}
        <Button
          type="button"
          className="flex-1"
          disabled={submitting || !canConfirmPicker(variant, selected)}
          onClick={onConfirm}
        >
          {submitting ? (
            <>
              <LoaderCircleIcon
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              发送中…
            </>
          ) : variant === "scan-share" ? (
            "分享"
          ) : (
            "确定"
          )}
        </Button>
      </div>
    </div>
  )
}

/** 滚动区的四种形态：加载骨架 / 拉取失败（可重试）/ 空清单 / 候选网格。 */
function PickerBody({
  status,
  isEmpty,
  groups,
  selected,
  onToggle,
  onRetry,
}: {
  status: ExchangeCardPickerStatus
  isEmpty: boolean
  groups: readonly PickerGroup[]
  selected: readonly number[]
  onToggle: (cardNumber: number) => void
  onRetry: () => void
}) {
  if (status === "loading") return <ExchangeCardPickerSkeletonGrid />
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">候选名片加载失败。</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      </div>
    )
  }
  if (isEmpty) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        你还没有已发布的名片
      </p>
    )
  }
  return (
    <ExchangeCardPickerGrid
      groups={groups}
      selected={selected}
      onToggle={onToggle}
    />
  )
}
