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
import { MessagePaper, noteColors } from "./wall-message-note"

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
  onSaved: (note: FudabaMessage) => void
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
  const intent = useRef({ fingerprint: "", key: crypto.randomUUID() })
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const count = Array.from(content.trim()).length
  async function submit() {
    if (busy || count < 1 || count > 280) return
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
    intent.current.fingerprint = fingerprint
    try {
      const result = note
        ? await editFudabaMessage(note.id, {
            content,
            color,
            expectedRevision: revision,
          }).send()
        : await createFudabaMessage(
            officeId,
            { content, color, center: initialCenter.current },
            intent.current.key
          ).send()
      if (alive.current) {
        onSaved(result.message)
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
      <DialogContent className="sm:max-w-2xl" layout="pinned" aria-busy={busy}>
        <DialogHeader>
          <DialogTitle>{note ? "编辑留言" : "贴便签留言"}</DialogTitle>
          <DialogDescription>
            纯文字与 emoji，每条最多 280 个计数；组合 emoji 可能占多个计数。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5 px-1">
          <div>
            <label
              htmlFor="wall-message-content"
              className="mb-2 block text-sm font-medium"
            >
              留言正文
            </label>
            <Textarea
              id="wall-message-content"
              value={content}
              disabled={busy}
              className="min-h-32"
              onChange={(event) => setContent(event.target.value)}
              aria-describedby="wall-message-count"
            />
            <p
              id="wall-message-count"
              className={cn(
                "mt-2 text-sm",
                count > 280 ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {count} / 280
            </p>
          </div>
          <fieldset disabled={busy}>
            <legend className="mb-2 text-sm font-medium">纸张颜色</legend>
            <div className="flex flex-wrap gap-2">
              {noteColors.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-label={choice.name}
                  aria-pressed={color === choice.value}
                  className={cn(
                    "size-11 rounded border",
                    choice.swatch,
                    color === choice.value &&
                      "ring-2 ring-primary ring-offset-2"
                  )}
                  onClick={() => setColor(choice.value)}
                />
              ))}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              当前纸色：
              {noteColors.find((choice) => choice.value === color)?.name}
            </p>
          </fieldset>
          <div
            className="relative mx-auto h-69.25 w-60.5"
            aria-label="便签预览"
          >
            <MessagePaper
              message={{
                content,
                color,
                authorName: note?.authorName ?? "你的署名",
                createdAt: note?.createdAt ?? new Date().toISOString(),
              }}
            />
          </div>
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
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={
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
        <DialogContent className="sm:max-w-xl" layout="pinned" aria-busy={busy}>
          <DialogHeader>
            <DialogTitle>留言全文</DialogTitle>
            <DialogDescription>
              {value.authorName} ·{" "}
              {new Date(value.createdAt).toLocaleString("zh-CN")}
              {value.updatedAt !== value.createdAt
                ? ` · 更新于 ${new Date(value.updatedAt).toLocaleString("zh-CN")}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-base/relaxed wrap-break-word whitespace-pre-wrap">
              {value.content}
            </p>
            {privateNote ? (
              <p className="mt-4 text-sm text-muted-foreground">
                支部：{privateNote.hiddenByOffice ? "已隐藏" : "未隐藏"} ·
                后台：{privateNote.hiddenByAdmin ? "已隐藏" : "未隐藏"}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter className="flex-wrap">
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
