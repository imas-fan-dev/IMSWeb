import { useEffect, useRef, useState } from "react"
import {
  AdminPageHeader,
  AdminPanel,
  AdminField,
} from "~/components/admin/admin-ui"
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
  communityContentDraftSchema,
  isApiError,
  type CommunityContentDraft,
  type CommunityContentEntry,
} from "~/lib/api"

import { CommunityEntryList } from "./components/community-entry-list"
import { CommunityEntryEditorDialog } from "./components/community-entry-editor-dialog"
import { newCommunityEntry, sameContent } from "./community-model"

export function meta() {
  return [{ title: "制作人社区管理 | IMSWeb" }]
}
export default function AdminCommunity() {
  const [draft, setDraft] = useState<CommunityContentDraft | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(true)
  const [conflict, setConflict] = useState(false)
  const [baseline, setBaseline] = useState<CommunityContentDraft | null>(null)
  const dirty = !sameContent(draft, baseline)
  const [session, setSession] = useState<{
    token: string
    originalId: string | null
    initial: CommunityContentEntry
  } | null>(null)
  const editRefs = useRef(new Map<string, HTMLButtonElement>())
  const addRef = useRef<HTMLButtonElement>(null)
  const focusId = useRef<string | null>(null)
  const focusFrame = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
    },
    []
  )
  const [loaded, setLoaded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [confirmation, setConfirmation] = useState<
    { kind: "reload" } | { kind: "delete"; id: string } | null
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
        setBaseline(value)
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
    if (!conflict) setMessage("")
  }
  function move(id: string, offset: number) {
    if (!draft) return
    const index = draft.entries.findIndex((entry) => entry.id === id)
    if (
      index < 0 ||
      index + offset < 0 ||
      index + offset >= draft.entries.length
    )
      return
    const entries = [...draft.entries]
    const [entry] = entries.splice(index, 1)
    entries.splice(index + offset, 0, entry)
    change({ ...draft, entries })
  }
  function closeEditor() {
    setSession(null)
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
    focusFrame.current = requestAnimationFrame(() => {
      const target =
        (focusId.current ? editRefs.current.get(focusId.current) : null) ??
        addRef.current
      target?.focus()
    })
  }
  function openEditor(
    initial: CommunityContentEntry,
    originalId: string | null
  ) {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
    focusId.current = originalId
    setSession({
      token: crypto.randomUUID(),
      originalId,
      initial: { ...initial },
    })
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
      setBaseline(value)
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
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="COMMUNITY"
        title="制作人社区"
        description="管理社区首页文字、入口与显示范围。"
        actions={
          <>
            <Button
              variant="outline"
              disabled={busy || session !== null}
              onClick={() => {
                if (dirty && draft) setConfirmation({ kind: "reload" })
                else reload()
              }}
            >
              {busy && !draft ? "正在读取" : "重新读取"}
            </Button>
            {draft && (
              <Button
                disabled={
                  busy || conflict || !loaded || !dirty || session !== null
                }
                onClick={() => void save()}
              >
                保存配置
              </Button>
            )}
          </>
        }
      />
      {message && (
        <p role="alert" className="wrap-anywhere">
          {message}
        </p>
      )}
      <span role="status" className="text-sm text-muted-foreground">
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
      {draft && (
        <>
          <AdminPanel title="基础设置">
            <fieldset
              disabled={busy || !loaded}
              className="grid min-w-0 gap-5 sm:grid-cols-2"
            >
              <AdminField label="页面标题" htmlFor="community-title">
                <Input
                  id="community-title"
                  className="h-10"
                  maxLength={80}
                  value={draft.title}
                  onChange={(e) => change({ ...draft, title: e.target.value })}
                />
              </AdminField>
              <AdminField label="页面简介" htmlFor="community-introduction">
                <Textarea
                  id="community-introduction"
                  className="font-sans"
                  maxLength={300}
                  value={draft.introduction}
                  onChange={(e) =>
                    change({ ...draft, introduction: e.target.value })
                  }
                />
              </AdminField>
            </fieldset>
          </AdminPanel>
          <AdminPanel
            title="社区入口"
            description={`${draft.entries.length} 个入口`}
            action={
              <Button
                ref={addRef}
                variant="outline"
                className="max-sm:min-h-11"
                disabled={busy || !loaded || draft.entries.length >= 100}
                onClick={() => openEditor(newCommunityEntry(), null)}
              >
                新增入口
              </Button>
            }
            contentClassName="min-w-0"
          >
            <CommunityEntryList
              entries={draft.entries}
              disabled={busy || !loaded}
              onEdit={(entry) => openEditor(entry, entry.id)}
              onMove={move}
              onDelete={(id) => setConfirmation({ kind: "delete", id })}
              onEditRef={(id, node) => {
                if (node) editRefs.current.set(id, node)
                else editRefs.current.delete(id)
              }}
            />
          </AdminPanel>
          {session && (
            <CommunityEntryEditorDialog
              key={session.token}
              initial={session.initial}
              originalId={session.originalId}
              entries={draft.entries}
              returnFocus={() =>
                (focusId.current
                  ? editRefs.current.get(focusId.current)
                  : null) ?? addRef.current
              }
              onCancel={closeEditor}
              onConfirm={(entry) => {
                focusId.current = session.originalId === null ? null : entry.id
                if (
                  !sameContent(entry, session.initial) ||
                  session.originalId === null
                )
                  change({
                    ...draft,
                    entries:
                      session.originalId === null
                        ? [...draft.entries, entry]
                        : draft.entries.map((value) =>
                            value.id === session.originalId ? entry : value
                          ),
                  })
                closeEditor()
              }}
            />
          )}
        </>
      )}
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <AlertDialogContent finalFocus={() => addRef.current}>
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
                      (entry) => entry.id !== confirmation.id
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
