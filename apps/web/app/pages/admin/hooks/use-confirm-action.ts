import { useCallback, useRef, useState } from "react"
import type { ReactNode } from "react"
import { toast } from "sonner"

import { adminErrorMessage } from "~/lib/admin-error"

export type ConfirmActionStatus = "idle" | "confirming" | "submitting" | "error"

export interface ConfirmActionOptions<T> {
  onConfirm: (item: T) => Promise<void>
  getTitle: (item: T) => string
  getDescription: (item: T) => ReactNode
  successMessage: string | ((item: T) => string)
  getFallbackFocus?: (item: T) => HTMLElement | null
  /**
   * 失败后重新取这一条的最新版本。返回非空即替换对话框里的目标，
   * 免得版本竞争之后还拿着旧 revision 反复提交。
   */
  reloadTarget?: (item: T) => Promise<T | null>
}

function messageFor<T>(
  message: ConfirmActionOptions<T>["successMessage"],
  item: T
) {
  return typeof message === "function" ? message(item) : message
}

export function useConfirmAction<T>({
  onConfirm,
  getTitle,
  getDescription,
  successMessage,
  getFallbackFocus,
  reloadTarget,
}: ConfirmActionOptions<T>) {
  const [target, setTarget] = useState<T | null>(null)
  const [status, setStatus] = useState<ConfirmActionStatus>("idle")
  const inFlightRef = useRef(false)
  const triggerRef = useRef<HTMLElement | null>(null)

  const restoreFocus = useCallback(
    (item: T) => {
      window.requestAnimationFrame(() => {
        const trigger = triggerRef.current
        const focusTarget =
          trigger?.isConnected && !trigger.hasAttribute("disabled")
            ? trigger
            : getFallbackFocus?.(item)
        focusTarget?.focus()
        triggerRef.current = null
      })
    },
    [getFallbackFocus]
  )

  const requestAction = useCallback((item: T, trigger?: HTMLElement) => {
    if (inFlightRef.current) return
    triggerRef.current =
      trigger ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null)
    setTarget(item)
    setStatus("confirming")
  }, [])

  const cancelAction = useCallback(() => {
    if (inFlightRef.current) return
    if (target) restoreFocus(target)
    setTarget(null)
    setStatus("idle")
  }, [restoreFocus, target])

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelAction()
    },
    [cancelAction]
  )

  const confirmAction = useCallback(async () => {
    if (!target || inFlightRef.current) return

    const currentTarget = target
    inFlightRef.current = true
    setStatus("submitting")
    try {
      await onConfirm(currentTarget)
      toast.success(messageFor(successMessage, currentTarget))
      setTarget(null)
      setStatus("idle")
      restoreFocus(currentTarget)
    } catch (error) {
      toast.error(adminErrorMessage(error))
      setStatus("error")
      if (reloadTarget) {
        const refreshed = await reloadTarget(currentTarget).catch(() => null)
        if (refreshed) setTarget(refreshed)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [onConfirm, reloadTarget, restoreFocus, successMessage, target])

  return {
    target,
    status,
    open: target !== null,
    submitting: status === "submitting",
    onOpenChange,
    requestAction,
    cancelAction,
    confirmAction,
    description: target ? getDescription(target) : null,
    title: target ? getTitle(target) : "",
  }
}
