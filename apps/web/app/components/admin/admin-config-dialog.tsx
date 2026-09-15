import { LoaderCircleIcon, SaveIcon } from "lucide-react"
import type { FormEvent, ReactNode } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"

export function AdminConfigDialog({
  open,
  title,
  description,
  icon,
  contentClassName,
  submitLabel,
  submitDisabled = false,
  saving,
  children,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  title: string
  description: string
  icon?: ReactNode
  contentClassName?: string
  submitLabel: string
  submitDisabled?: boolean
  saving: boolean
  children: ReactNode
  onOpenChange: (open: boolean) => void
  onSubmit: () => void | Promise<void>
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!saving) void onSubmit()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto ${contentClassName ?? "sm:max-w-lg"}`}
        showCloseButton={!saving}
      >
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            {icon ? (
              <div className="flex items-start gap-3 pr-8">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  {icon}
                </span>
                <div className="flex min-w-0 flex-col gap-2">
                  <DialogTitle>{title}</DialogTitle>
                  <DialogDescription>{description}</DialogDescription>
                </div>
              </div>
            ) : (
              <>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </>
            )}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving || submitDisabled}>
              {saving ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
