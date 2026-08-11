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
    } finally {
      inFlightRef.current = false
    }
  }, [onConfirm, restoreFocus, successMessage, target])

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
