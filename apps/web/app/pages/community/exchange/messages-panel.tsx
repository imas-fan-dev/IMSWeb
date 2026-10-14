import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { getFudabaMessages, type FudabaMessage } from "~/lib/api"
import { MessageComposer, MessageReader } from "./wall-message-dialog"

type Filter = "all" | "visible" | "office-hidden" | "admin-hidden"
export function MessagesPanel({
  mode,
  officeId,
}: {
  mode: "mine" | "office" | "admin"
  officeId?: string
}) {
  const [messages, setMessages] = useState<FudabaMessage[]>([])
  const [status, setStatus] = useState<Filter>("all")
  const [officeFilter, setOfficeFilter] = useState("")
  const [appliedOffice, setAppliedOffice] = useState("")
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reader, setReader] = useState<FudabaMessage | null>(null)
  const [editor, setEditor] = useState<FudabaMessage | null>(null)
  const generation = useRef(0)
  const load = useCallback(
    (next?: string, signal?: AbortSignal) => {
      const current = ++generation.current
      return getFudabaMessages(mode, {
        officeId: officeId ?? (appliedOffice || undefined),
        status,
        cursor: next,
      })
        .send()
        .then((result) => {
          if (current !== generation.current || signal?.aborted) return
          if (
            result.pageInfo.hasNextPage &&
            (!result.pageInfo.nextCursor || result.pageInfo.nextCursor === next)
          )
            throw new Error("留言列表暂时无法完整载入，请重试。")
          setReader((previous) =>
            previous
              ? (result.messages.find(
                  (message) => message.id === previous.id
                ) ?? (next ? previous : null))
              : null
          )
          setMessages((previous) =>
            next
              ? [
                  ...new Map(
                    [...previous, ...result.messages].map((message) => [
                      message.id,
                      message,
                    ])
                  ).values(),
                ]
              : result.messages
          )
          setCursor(
            result.pageInfo.hasNextPage ? result.pageInfo.nextCursor : null
          )
        })
        .catch((failure) => {
          if (current === generation.current && !signal?.aborted)
            setError(
              failure instanceof Error ? failure.message : "留言暂时无法载入。"
            )
        })
        .finally(() => {
          if (current === generation.current && !signal?.aborted) setBusy(false)
        })
    },
    [mode, officeId, appliedOffice, status]
  )
  const refresh = (next?: string) => {
    setBusy(true)
    setError(null)
    void load(next)
  }
  const scope = `${mode}/${officeId ?? ""}/${appliedOffice}/${status}`
  const [previousScope, setPreviousScope] = useState(scope)
  if (scope !== previousScope) {
    setPreviousScope(scope)
    setMessages([])
    setCursor(null)
    setReader(null)
    setBusy(true)
    setError(null)
  }
  useEffect(() => {
    const controller = new AbortController()
    void load(undefined, controller.signal)
    return () => controller.abort()
  }, [load])
  const title =
    mode === "mine"
      ? "我的留言"
      : mode === "office"
        ? "支部留言管理"
        : "后台留言管理"
  return (
    <section
      className="mt-6 space-y-4 border-t pt-6"
      aria-label={title}
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button variant="outline" disabled={busy} onClick={() => refresh()}>
          刷新留言
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block">显示状态</span>
          <select
            value={status}
            disabled={busy}
            onChange={(event) => setStatus(event.target.value as Filter)}
            className="h-11 rounded border bg-background px-3"
          >
            <option value="all">全部</option>
            <option value="visible">公开可见</option>
            <option value="office-hidden">支部隐藏</option>
            <option value="admin-hidden">后台隐藏</option>
          </select>
        </label>
        {mode === "admin" ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setAppliedOffice(officeFilter.trim())
            }}
          >
            <label className="space-y-1 text-sm">
              <span className="block">支部编号</span>
              <Input
                value={officeFilter}
                onChange={(event) => setOfficeFilter(event.target.value)}
                placeholder="留空显示所有支部"
              />
            </label>
            <Button variant="outline" disabled={busy}>
              筛选
            </Button>
          </form>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!messages.length ? (
        <p className="border-y py-8 text-center text-sm text-muted-foreground">
          {busy
            ? "载入留言…"
            : error
              ? "请重新载入留言。"
              : "暂无符合条件的留言。"}
        </p>
      ) : (
        <ul className="divide-y border-y">
          {messages.map((message) => (
            <li key={message.id} className="space-y-2 py-4">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  {message.authorName} · {message.office.name}
                </span>
                <time dateTime={message.createdAt}>
                  {new Date(message.createdAt).toLocaleString("zh-CN")}
                </time>
              </div>
              <p className="line-clamp-3 wrap-break-word whitespace-pre-wrap">
                {message.content}
              </p>
              <p className="text-xs text-muted-foreground">
                支部：{message.hiddenByOffice ? "已隐藏" : "未隐藏"} · 后台：
                {message.hiddenByAdmin ? "已隐藏" : "未隐藏"}
                {message.office.status !== "active"
                  ? " · 支部已隐藏或归档"
                  : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setReader(message)}>
                  查看与操作
                </Button>
                {message.office.status === "active" &&
                !message.hiddenByOffice &&
                !message.hiddenByAdmin ? (
                  <NavigationLink
                    className="inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4"
                    to={`/community/exchange/offices/${encodeURIComponent(message.office.slug)}?message=${encodeURIComponent(message.id)}`}
                  >
                    定位到墙上
                  </NavigationLink>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => refresh(cursor)}
        >
          加载更多留言
        </Button>
      ) : null}
      {reader ? (
        <MessageReader
          key={reader.id}
          note={reader}
          onClose={() => setReader(null)}
          onEdit={(note) => {
            setReader(null)
            setEditor(note)
          }}
          onChanged={(id) => {
            if (id)
              setMessages((current) =>
                current.filter((message) => message.id !== id)
              )
            refresh()
          }}
        />
      ) : null}
      {editor ? (
        <MessageComposer
          key={editor.id}
          officeId={editor.office.id}
          note={editor}
          onClose={() => setEditor(null)}
          onSaved={() => refresh()}
        />
      ) : null}
    </section>
  )
}
