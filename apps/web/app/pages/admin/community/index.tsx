import { useEffect, useState } from "react"
import { AdminPageHeader } from "~/components/admin/admin-ui"
import { Button } from "~/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  getAdminCommunityContent,
  updateAdminCommunityContent,
  uploadAdminCommunityContentImage,
  communityContentDraftSchema,
  isApiError,
  type CommunityContentDraft,
  type CommunityContentEntry,
} from "~/lib/api"

import { CommunityEntryEditor } from "./components/community-entry-editor"

export function meta() {
  return [{ title: "制作人社区管理 | IMSWeb" }]
}
export default function AdminCommunity() {
  const [draft, setDraft] = useState<CommunityContentDraft | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(true)
  const [conflict, setConflict] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [confirmation, setConfirmation] = useState<
    { kind: "reload" } | { kind: "delete"; index: number } | null
  >(null)
  function reload() {
    setBusy(true)
    setLoaded(false)
    setAttempt((value) => value + 1)
  }
  useEffect(() => {
    let active = true
    void getAdminCommunityContent()
      .send()
      .then(({ content, revision }) => {
        if (!active) return
        const value: CommunityContentDraft = {
          version: content.version,
          title: content.title,
          introduction: content.introduction,
          entries: content.entries,
        }
        setLoaded(true)
        setDraft(value)
        setRevision(revision)
        setConflict(false)
        setDirty(false)
        setMessage("")
      })
      .catch(() => {
        if (active) setMessage("无法读取配置，请重试。")
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [attempt])
  function change(value: CommunityContentDraft) {
    setDraft(value)
    setDirty(true)
    if (!conflict) setMessage("")
  }
  function entryChange(index: number, patch: Partial<CommunityContentEntry>) {
    if (draft)
      change({
        ...draft,
        entries: draft.entries.map((entry, i) =>
          i === index ? { ...entry, ...patch } : entry
        ),
      })
  }
  function move(index: number, offset: number) {
    if (!draft) return
    const entries = [...draft.entries]
    const [entry] = entries.splice(index, 1)
    entries.splice(index + offset, 0, entry)
    change({ ...draft, entries })
  }
  async function save() {
    if (!draft || busy || conflict || !loaded) return
    const result = communityContentDraftSchema.safeParse(draft)
    if (!result.success) {
      setMessage(
        result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("；")
      )
      return
    }
    setBusy(true)
    try {
      const saved = await updateAdminCommunityContent(
        result.data,
        revision
      ).send()
      const value: CommunityContentDraft = {
        version: saved.content.version,
        title: saved.content.title,
        introduction: saved.content.introduction,
        entries: saved.content.entries,
      }
      setDraft(value)
      setRevision(saved.revision)
      setDirty(false)
      setMessage("已保存")
    } catch (error) {
      const stale = isApiError(error) && error.status === 409
      setConflict(stale)
      setMessage(
        stale
          ? "配置已被其他编辑修改。本地草稿已保留，请核对后重新读取。"
          : "保存失败，本地草稿已保留，请重试。"
      )
    } finally {
      setBusy(false)
    }
  }
  async function upload(index: number, file: File | null) {
    if (!file || busy) return
    setBusy(true)
    try {
      const { url } = await uploadAdminCommunityContentImage(file).send()
      setDraft(
        (current) =>
          current && {
            ...current,
            entries: current.entries.map((entry, i) =>
              i === index ? { ...entry, imageUrl: url } : entry
            ),
          }
      )
      setDirty(true)
      if (!conflict) setMessage("图片已上传，请保存配置。")
    } catch {
      setMessage("图片上传失败，请检查格式和大小后重试。")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="COMMUNITY"
        title="制作人社区"
        description="管理社区首页文字、入口与显示范围。"
      />
      {message && (
        <p role="alert" className="wrap-anywhere">
          {message}
        </p>
      )}
      {!draft ? (
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setAttempt((n) => n + 1)
          }}
        >
          {busy ? "正在读取" : "重新读取"}
        </Button>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || conflict || !loaded || !dirty}
              onClick={() => void save()}
            >
              保存配置
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (dirty) setConfirmation({ kind: "reload" })
                else reload()
              }}
            >
              重新读取
            </Button>
            <span role="status">
              {busy
                ? "正在处理"
                : !loaded
                  ? "读取失败，保存已禁用"
                  : conflict
                    ? "配置冲突，重新读取后才能保存"
                    : dirty
                      ? "有未保存修改"
                      : "已与服务器同步"}
            </span>
          </div>
          <fieldset disabled={busy || !loaded} className="min-w-0 space-y-5">
            <label className="block space-y-2">
              页面标题
              <Input
                maxLength={80}
                value={draft.title}
                onChange={(e) => change({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="block space-y-2">
              页面简介
              <Textarea
                maxLength={300}
                value={draft.introduction}
                onChange={(e) =>
                  change({ ...draft, introduction: e.target.value })
                }
              />
            </label>
            {draft.entries.map((entry, index) => (
              <CommunityEntryEditor
                key={index}
                entry={entry}
                index={index}
                count={draft.entries.length}
                busy={busy}
                onMove={(offset) => move(index, offset)}
                onDelete={() => setConfirmation({ kind: "delete", index })}
                onChange={(patch) => entryChange(index, patch)}
                onUpload={(file) => void upload(index, file)}
              />
            ))}
            <Button
              variant="outline"
              disabled={draft.entries.length >= 100}
              onClick={() =>
                change({
                  ...draft,
                  entries: [
                    ...draft.entries,
                    {
                      id: `entry-${crypto.randomUUID()}`,
                      title: "新入口",
                      description: "",
                      href: "/community",
                      icon: "users",
                      imageUrl: null,
                      enabled: true,
                      audience: "all",
                      availability: "always",
                    },
                  ],
                })
              }
            >
              添加入口
            </Button>
          </fieldset>
        </>
      )}
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.kind === "reload"
                ? "丢弃本地草稿并重新读取？"
                : "删除这个入口？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.kind === "reload"
                ? "未保存的修改将丢失。重新读取成功后可继续编辑。"
                : "删除会在保存配置后生效。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmation?.kind === "reload") reload()
                else if (confirmation?.kind === "delete" && draft)
                  change({
                    ...draft,
                    entries: draft.entries.filter(
                      (_, i) => i !== confirmation.index
                    ),
                  })
                setConfirmation(null)
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
