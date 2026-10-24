import { useMessagePaperHeight } from "./use-message-paper-height"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import {
  createFudabaMessage,
  editFudabaMessage,
  getFudabaPrivateMessage,
  destroyFudabaMessage,
  moderateFudabaMessage,
  isApiError,
  type FudabaMessage,
  type FudabaPublicMessage,
} from "~/lib/api"
import { cn } from "~/lib/utils"
import {
  MessagePaper,
  MessagePaperSurface,
  liftedPaperShadow,
  noteColors,
} from "./wall-message-note"

const liftedDialogClass =
  "top-1/2 left-1/2 flex max-h-(--overlay-safe-height) w-(--overlay-safe-width) max-w-md -translate-1/2 flex-col gap-4 overflow-visible rounded-none border-0 bg-transparent p-0 text-foreground shadow-none backdrop-blur-none before:hidden after:hidden"
const liftedDialogStyle = {
  background: "transparent",
  backgroundImage: "none",
  border: 0,
  boxShadow: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
} as const
const floatingFooterClass =
  "mx-0 mb-0 flex-row flex-wrap items-center justify-center gap-2 rounded-none border-0 bg-transparent p-0 sm:justify-center"

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "操作暂时失败，请重试。"
}
export function MessageComposer({
  officeId,
  note,
  center,
  onClose,
  onSaved,
}: {
  officeId: string
  note?: FudabaMessage
  center?: { x: number; y: number }
  onClose: () => void
  onSaved: (note: FudabaMessage, height?: number) => void
}) {
  const [content, setContent] = useState(note?.content ?? "")
  const [color, setColor] = useState<FudabaMessage["color"]>(
    note?.color ?? "cream"
  )
  const [revision, setRevision] = useState(note?.contentRevision ?? 0)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [latest, setLatest] = useState<FudabaMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const initialCenter = useRef(center)
  const intent = useRef({
    fingerprint: "",
    height: 277,
    key: crypto.randomUUID(),
  })
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const count = Array.from(content.trim()).length
  const {
    measureRef: paperMeasureRef,
    height: paperHeight,
    ready: paperReady,
  } = useMessagePaperHeight(content)
  async function submit() {
    if (busy || !paperReady || count < 1 || count > 280) return
    setBusy(true)
    setError(null)
    const fingerprint = JSON.stringify([
      officeId,
      content.trim(),
      color,
      initialCenter.current,
    ])
    if (
      intent.current.fingerprint &&
      intent.current.fingerprint !== fingerprint
    )
      intent.current.key = crypto.randomUUID()
    if (intent.current.fingerprint !== fingerprint)
      intent.current.height = paperHeight
    intent.current.fingerprint = fingerprint
    try {
      const result = note
        ? await editFudabaMessage(note.id, {
            content,
            color,
            height: paperHeight,
            expectedRevision: revision,
          }).send()
        : await createFudabaMessage(
            officeId,
            {
              content,
              color,
              height: intent.current.height,
              center: initialCenter.current,
            },
            intent.current.key
          ).send()
      if (alive.current) {
        onSaved(result.message, note ? paperHeight : intent.current.height)
        onClose()
      }
    } catch (failure) {
      if (alive.current) {
        setError(errorText(failure))
        setConflict(
          isApiError(failure) && failure.code === "FUDABA_MESSAGE_CONFLICT"
        )
      }
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  async function reload() {
    if (!note || busy) return
    setBusy(true)
    try {
      const result = await getFudabaPrivateMessage(note.id).send()
      if (alive.current) {
        setLatest(result.message)
        setRevision(result.message.contentRevision)
        setConflict(false)
        setError("已读取最新版本；你的草稿仍保留，请核对后保存。")
      }
    } catch (failure) {
      if (alive.current) setError(errorText(failure))
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        className={liftedDialogClass}
        style={liftedDialogStyle}
        safeArea="custom"
        layout="pinned"
        overlayClassName="bg-black/25 backdrop-blur-sm"
        aria-busy={busy}
      >
        <DialogHeader className="gap-1 px-8 text-center">
          <DialogTitle>{note ? "编辑留言" : "贴便签留言"}</DialogTitle>
          <DialogDescription className="text-xs">
            纯文字与 emoji，每条最多 280 个计数；组合 emoji 可能占多个计数。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 px-1 py-3">
          <label htmlFor="wall-message-content" className="sr-only">
            留言正文
          </label>
          <div
            ref={paperMeasureRef}
            aria-hidden="true"
            data-message-measure="true"
            className="pointer-events-none fixed top-0 -left-10000 w-60.5 opacity-0"
          >
            <MessagePaper
              measurement
              message={{
                content: content.trim(),
                color,
                authorName: note?.authorName ?? "你的署名",
                createdAt: note?.createdAt ?? "2026-01-01T00:00:00.000Z",
              }}
            />
          </div>
          <div
            style={{ height: paperHeight, filter: liftedPaperShadow }}
            className="relative mx-auto w-60.5 shrink-0 focus-within:outline focus-within:outline-1 focus-within:outline-offset-4 focus-within:outline-primary/35"
            aria-label="便签预览"
            data-lifted-note="true"
          >
            <MessagePaper
              lifted
              message={{
                content,
                color,
                authorName: note?.authorName ?? "你的署名",
                createdAt: note?.createdAt ?? new Date().toISOString(),
              }}
              editor={
                <Textarea
                  id="wall-message-content"
                  value={content}
                  disabled={busy}
                  onChange={(event) => setContent(event.target.value)}
                  aria-describedby="wall-message-count"
                  placeholder="写下想留在墙上的话…"
                  className="absolute inset-0 field-sizing-fixed h-full min-h-0 resize-none rounded-none border-0 bg-transparent p-0 text-[15px] leading-[1.75] shadow-none outline-none focus-visible:border-transparent focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
                />
              }
            />
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <span>直接在纸上书写</span>
            <span aria-hidden="true">·</span>
            <p
              id="wall-message-count"
              className={cn("tabular-nums", count > 280 && "text-destructive")}
            >
              {count} / 280
            </p>
          </div>
          <fieldset disabled={busy} className="mx-auto w-fit">
            <legend className="sr-only">纸张颜色</legend>
            <div className="flex justify-center gap-2">
              {noteColors.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-label={choice.name}
                  aria-pressed={color === choice.value}
                  className={cn(
                    "size-11 rounded-full border-4 border-background/80 shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    choice.swatch,
                    color === choice.value &&
                      "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  )}
                  onClick={() => setColor(choice.value)}
                />
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              当前纸色：
              {noteColors.find((choice) => choice.value === color)?.name}
            </p>
          </fieldset>
          {latest ? (
            <details className="rounded border p-3">
              <summary>服务器上的最新正文</summary>
              <p className="mt-2 whitespace-pre-wrap">{latest.content}</p>
            </details>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {conflict ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void reload()}
            >
              读取最新版本，保留草稿
            </Button>
          ) : null}
        </DialogBody>
        <DialogFooter className={floatingFooterClass}>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={
              !paperReady ||
              busy ||
              count < 1 ||
              count > 280 ||
              conflict ||
              (latest !== null && !latest.capabilities.canEdit)
            }
            onClick={() => void submit()}
          >
            {busy ? "正在保存…" : note ? "保存修改" : "发布便签"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export function MessageReader({
  note,
  canManage = false,
  onClose,
  onEdit,
  onChanged,
}: {
  note: FudabaPublicMessage | FudabaMessage
  canManage?: boolean
  onClose: () => void
  onEdit: (note: FudabaMessage) => void
  onChanged: (destroyedId?: string) => void
}) {
  const [privateNote, setPrivateNote] = useState<FudabaMessage | null>(
    "contentRevision" in note ? note : null
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [previousNote, setPreviousNote] = useState(note)
  if (note !== previousNote) {
    setPreviousNote(note)
    setPrivateNote("contentRevision" in note ? note : null)
  }
  useEffect(() => {
    let alive = true
    if (
      !("contentRevision" in note) &&
      (note.capabilities.canEdit || note.capabilities.canDestroy || canManage)
    ) {
      const request = getFudabaPrivateMessage(note.id)
      void request
        .send()
        .then((result) => {
          if (alive) setPrivateNote(result.message)
        })
        .catch((failure) => {
          if (alive) setError(errorText(failure))
        })
      return () => {
        alive = false
        request.abort()
      }
    }
    return () => {
      alive = false
    }
  }, [note, canManage])
  const value = privateNote ?? note
  async function destroy() {
    if (!privateNote?.capabilities.canDestroy || busy) return
    setBusy(true)
    setError(null)
    try {
      await destroyFudabaMessage(note.id).send()
      setConfirm(false)
      onChanged(note.id)
      onClose()
      toast.success("留言已永久删除。")
    } catch (failure) {
      if (isApiError(failure) && failure.code === "FUDABA_MESSAGE_GONE") {
        setConfirm(false)
        onChanged(note.id)
        onClose()
      } else setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }
  async function moderate(admin: boolean) {
    if (!privateNote || busy) return
    setBusy(true)
    setError(null)
    try {
      await moderateFudabaMessage(
        note.id,
        {
          hidden: !(admin
            ? privateNote.hiddenByAdmin
            : privateNote.hiddenByOffice),
          expectedRevision: privateNote.moderationRevision,
        },
        admin
      ).send()
      onChanged()
      onClose()
    } catch (failure) {
      setError(errorText(failure))
      if (isApiError(failure) && failure.status === 409) onChanged()
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose()
        }}
      >
        <DialogContent
          className={liftedDialogClass}
          style={liftedDialogStyle}
          safeArea="custom"
          layout="pinned"
          overlayClassName="bg-black/25 backdrop-blur-sm"
          aria-busy={busy}
        >
          <DialogHeader className="px-8 text-center">
            <DialogTitle className="text-sm font-medium">留言全文</DialogTitle>
            <DialogDescription className="sr-only">
              {value.authorName}的留言，发表于
              {new Date(value.createdAt).toLocaleString("zh-CN")}
            </DialogDescription>
          </DialogHeader>
          <MessagePaperSurface color={value.color} className="min-h-60 flex-1">
            <DialogBody>
              <p className="text-base/7 wrap-break-word whitespace-pre-wrap">
                {value.content}
              </p>
            </DialogBody>
            <div className="mt-6 shrink-0 border-t border-current/10 pt-4">
              <p className="truncate text-sm font-medium">{value.authorName}</p>
              <p className="mt-1 text-[11px] opacity-70">
                发表于{" "}
                <time dateTime={value.createdAt}>
                  {new Date(value.createdAt).toLocaleString("zh-CN")}
                </time>
              </p>
              {value.updatedAt !== value.createdAt ? (
                <p className="mt-1 text-[11px] opacity-70">
                  更新于{" "}
                  <time dateTime={value.updatedAt}>
                    {new Date(value.updatedAt).toLocaleString("zh-CN")}
                  </time>
                </p>
              ) : null}
            </div>

            {privateNote ? (
              <p className="mt-3 text-xs opacity-70">
                支部：{privateNote.hiddenByOffice ? "已隐藏" : "未隐藏"} ·
                后台：
                {privateNote.hiddenByAdmin ? "已隐藏" : "未隐藏"}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter className="mx-0 mt-4 mb-0 flex-row flex-wrap items-center justify-end gap-2 rounded-none border-t border-current/10 bg-transparent px-0 pt-4 pb-0 sm:justify-end">
              {privateNote?.capabilities.canEdit ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => onEdit(privateNote)}
                >
                  编辑
                </Button>
              ) : null}
              {privateNote?.capabilities.canModerateOffice ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void moderate(false)}
                >
                  {privateNote.hiddenByOffice ? "解除支部隐藏" : "支部隐藏"}
                </Button>
              ) : null}
              {privateNote?.capabilities.canModerateAdmin ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void moderate(true)}
                >
                  {privateNote.hiddenByAdmin ? "解除后台隐藏" : "后台隐藏"}
                </Button>
              ) : null}
              {privateNote?.capabilities.canDestroy ? (
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setConfirm(true)}
                >
                  撤回并销毁
                </Button>
              ) : null}
              <Button variant="outline" disabled={busy} onClick={onClose}>
                关闭
              </Button>
            </DialogFooter>
          </MessagePaperSurface>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="永久删除留言？"
        description="留言正文和墙面位置会永久删除，无法恢复。"
        submitting={busy}
        onConfirm={() => void destroy()}
        confirmLabel="永久删除"
      />
    </>
  )
}
