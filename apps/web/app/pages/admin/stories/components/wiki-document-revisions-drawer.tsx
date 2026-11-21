import { HistoryIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import {
  getAdminWikiEntryDocumentRevision,
  getAdminWikiEntryDocumentRevisions,
  type WikiAdminEntryDocumentRevision,
  type WikiDocumentRevisionSummary,
} from "~/lib/api"
import { errorMessage } from "./wiki-workbench-model"
import {
  documentRevisionTimestamp,
  revisionLoadNote,
} from "./wiki-document-model"

type ListState = {
  key: string
  revisions: WikiDocumentRevisionSummary[] | null
  error: unknown
}

type SnapshotState = {
  key: string
  snapshot: WikiAdminEntryDocumentRevision | null
  error: unknown
}

const NO_LIST: ListState = { key: "", revisions: null, error: null }
const NO_SNAPSHOT: SnapshotState = { key: "", snapshot: null, error: null }

/**
 * "版本历史" drawer for one entry document.
 *
 * The API keeps the newest 30 snapshots per entry and lists them newest first.
 * Selecting a row reads that snapshot's Markdown for preview; "载入到编辑器"
 * hands the text to the editor as a *draft*, keeping the stored revision, so the
 * next save appends a forward revision instead of rewriting history.
 */
export function DocumentRevisionsDrawer({
  open,
  onOpenChange,
  entryId,
  storedRevision,
  onLoadRevision,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entryId: number
  /** The revision currently stored on the server; loading keeps it. */
  storedRevision: number
  /** Receives the selected snapshot's Markdown as an unsaved draft. */
  onLoadRevision: (sourceMarkdown: string) => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [list, setList] = useState<ListState>(NO_LIST)
  const [snapshot, setSnapshot] = useState<SnapshotState>(NO_SNAPSHOT)
  // Requests are keyed by what they were issued for, so reopening the drawer or
  // picking another revision invalidates the previous answer without an effect
  // that writes state during render.
  const listKey = open ? String(entryId) : ""
  const snapshotKey = open && selected !== null ? `${entryId}|${selected}` : ""

  useEffect(() => {
    if (!open) return
    let active = true
    void getAdminWikiEntryDocumentRevisions(entryId)
      .send()
      .then((result) => {
        if (active)
          setList({ key: listKey, revisions: result.revisions, error: null })
      })
      .catch((error: unknown) => {
        if (active) setList({ key: listKey, revisions: null, error })
      })
    return () => {
      active = false
    }
  }, [entryId, listKey, open])

  useEffect(() => {
    if (selected === null) return
    let active = true
    void getAdminWikiEntryDocumentRevision({ entryId, revision: selected })
      .send()
      .then((result) => {
        if (active)
          setSnapshot({ key: snapshotKey, snapshot: result, error: null })
      })
      .catch((error: unknown) => {
        if (active) setSnapshot({ key: snapshotKey, snapshot: null, error })
      })
    return () => {
      active = false
    }
  }, [entryId, selected, snapshotKey])

  const currentList = list.key === listKey ? list : NO_LIST
  const currentSnapshot = snapshot.key === snapshotKey ? snapshot : NO_SNAPSHOT
  const revisions = currentList.revisions ?? []
  const source = currentSnapshot.snapshot?.sourceMarkdown ?? null

  const close = (next: boolean) => {
    if (!next) setSelected(null)
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="right" className="w-[min(34rem,100vw)]">
        <SheetHeader className="border-b">
          <SheetTitle>版本历史</SheetTitle>
          <SheetDescription>
            每次保存都会留一份快照，每页只保留最近 30 个版本。
            {revisionLoadNote(storedRevision)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2">
          {currentList.error ? (
            <Alert>
              <AlertTitle>版本列表读取失败</AlertTitle>
              <AlertDescription>
                {errorMessage(currentList.error)}
              </AlertDescription>
            </Alert>
          ) : null}

          {currentList.revisions === null && !currentList.error ? (
            <p
              aria-live="polite"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin"
              />
              正在读取版本列表…
            </p>
          ) : null}

          {currentList.revisions !== null && revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              还没有保存过历史版本，第一次保存文档后会出现在这里。
            </p>
          ) : null}

          {revisions.length ? (
            <ul
              aria-label="历史版本"
              className="flex flex-col gap-1 rounded-md border p-1"
            >
              {revisions.map((revision) => (
                <li key={revision.revision}>
                  <button
                    type="button"
                    aria-pressed={selected === revision.revision}
                    className="flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-muted"
                    onClick={() => setSelected(revision.revision)}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono tabular-nums">
                        r{revision.revision}
                      </span>
                      <span className="min-w-0 font-medium">
                        {revision.summary || "（未填写摘要）"}
                      </span>
                      {revision.revision === storedRevision ? (
                        <span className="rounded-sm bg-muted px-1 text-[0.65rem] text-muted-foreground">
                          当前存档
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap gap-2 text-muted-foreground">
                      <span>
                        {documentRevisionTimestamp(revision.createdAt)}
                      </span>
                      <span>{revision.createdBy || "未知操作者"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {currentSnapshot.error ? (
            <Alert>
              <AlertTitle>历史版本读取失败</AlertTitle>
              <AlertDescription>
                {errorMessage(currentSnapshot.error)}
              </AlertDescription>
            </Alert>
          ) : null}

          {selected !== null &&
          currentSnapshot.snapshot === null &&
          !currentSnapshot.error ? (
            <p
              aria-live="polite"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin"
              />
              正在读取 r{selected} 的源码…
            </p>
          ) : null}

          {currentSnapshot.snapshot ? (
            <section className="flex min-h-0 flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                r{currentSnapshot.snapshot.revision} 源码
                {currentSnapshot.snapshot.summary
                  ? ` · ${currentSnapshot.snapshot.summary}`
                  : ""}
              </h3>
              <pre
                aria-label="历史版本源码预览"
                className="max-h-72 overflow-auto rounded-md border bg-muted/20 p-2 text-xs whitespace-pre-wrap"
              >
                {currentSnapshot.snapshot.sourceMarkdown}
              </pre>
            </section>
          ) : null}
        </div>

        <SheetFooter className="border-t">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {source === null ? (
                <>
                  <HistoryIcon data-icon="inline-start" />
                  选择一个版本查看源码
                </>
              ) : (
                `将 r${currentSnapshot.snapshot?.revision ?? 0} 载入为草稿`
              )}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={currentSnapshot.snapshot === null}
              onClick={() => {
                if (currentSnapshot.snapshot === null) return
                onLoadRevision(currentSnapshot.snapshot.sourceMarkdown)
                close(false)
              }}
            >
              载入到编辑器
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
