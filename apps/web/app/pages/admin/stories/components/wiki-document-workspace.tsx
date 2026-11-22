import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { RefreshCwIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Skeleton } from "~/components/ui/skeleton"
import {
  saveAdminWikiEntryDocument,
  uploadAdminWikiEntryDocumentMedia,
  wikiRevisionConflictRevision,
  type WikiContentMode,
  type WikiDocumentMediaItem,
  type WikiStoryCoverAsset,
  type WikiStoryContentType,
} from "~/lib/api"
import { errorMessage } from "./wiki-workbench-model"
import { useDocumentPreview, useWikiEntryDocument } from "./wiki-document-hooks"
import { WikiDocumentEditor } from "./wiki-document-editor"
import {
  DOCUMENT_MODE_LABELS,
  documentCategoryOptions,
  documentDraftIsDirty,
  type DocumentEntryMode,
} from "./wiki-document-model"

type SaveState = {
  saving: boolean
  saved: boolean
  error: unknown
  /** Server revision reported by a `409`, or `null` when there is no conflict. */
  conflict: number | null
}

const NO_DIRTY_REPORT = () => undefined

const IDLE_SAVE: SaveState = {
  saving: false,
  saved: false,
  error: null,
  conflict: null,
}

/**
 * Owns the structured ⇄ document switch for one selected entry.
 *
 * Both sides stay alive in one component: the structured outline is passed in
 * as a child and the Enhanced Markdown draft lives here, so switching modes
 * never deletes cards, categories, or an unsaved document draft. Saving sends
 * the draft with `expectedRevision`; a `409` keeps every character in place and
 * offers reload/overwrite recovery instead of discarding the edit.
 */
export function WikiDocumentWorkspace({
  entryId,
  entryName,
  categories,
  cards,
  coverAssets,
  contentTypes,
  onDraftDirtyChange,
  structured,
}: {
  entryId: number
  entryName: string
  /** The entry's existing structured categories and cards, used by the toolbar. */
  categories: readonly { name: string }[]
  cards: readonly { category: string }[]
  /** Agency shared covers the toolbar can embed as `cover:<id>`. */
  coverAssets: readonly WikiStoryCoverAsset[]
  /** Content types the batch Bilibili macro writes; the catalog's active ones. */
  contentTypes: readonly WikiStoryContentType[]
  /**
   * Reports whether the document draft differs from the stored document, so the
   * page can confirm before an entry switch would discard it.
   */
  onDraftDirtyChange?: (dirty: boolean) => void
  structured: ReactNode
}) {
  const { data, error, loading, reload, applySave } =
    useWikiEntryDocument(entryId)
  const [selectedMode, setSelectedMode] = useState<DocumentEntryMode | null>(
    null
  )
  const [pendingMode, setPendingMode] = useState<DocumentEntryMode | null>(null)
  const [draft, setDraft] = useState<{
    snapshot: typeof data
    source: string
  }>({ snapshot: null, source: "" })
  const [save, setSave] = useState<SaveState>(IDLE_SAVE)
  const [discardedDraft, setDiscardedDraft] = useState<string | null>(null)
  const [upload, setUpload] = useState<{
    uploading: boolean
    error: unknown
  }>({ uploading: false, error: null })

  const source =
    draft.snapshot === data ? draft.source : (data?.sourceMarkdown ?? "")
  const setSource = useCallback(
    (next: string | ((current: string) => string)) => {
      setDraft((current) => {
        const currentSource =
          current.snapshot === data
            ? current.source
            : (data?.sourceMarkdown ?? "")
        return {
          snapshot: data,
          source: typeof next === "function" ? next(currentSource) : next,
        }
      })
    },
    [data]
  )

  const reportDraftDirty = onDraftDirtyChange ?? NO_DIRTY_REPORT
  const storedMode: DocumentEntryMode = data?.contentMode ?? "structured"
  const mode = selectedMode ?? storedMode
  const dirty = documentDraftIsDirty(data, source)
  useEffect(() => {
    reportDraftDirty(dirty)
  }, [dirty, reportDraftDirty])
  const categoryOptions = useMemo(
    () => documentCategoryOptions(categories, cards),
    [cards, categories]
  )
  const preview = useDocumentPreview({
    entryId,
    enabled: mode === "document",
    source,
    snapshot: data,
  })

  const persist = useCallback(
    async (contentMode: WikiContentMode, expectedRevision: number) => {
      setSave({ ...IDLE_SAVE, saving: true })
      try {
        const result = await saveAdminWikiEntryDocument({
          entryId,
          contentMode,
          sourceMarkdown: source,
          expectedRevision,
        }).send()
        applySave({
          contentMode: result.contentMode,
          sourceMarkdown: source,
          revision: result.revision,
          document: result.document,
          warnings: result.warnings,
        })
        setSelectedMode(result.contentMode)
        setDiscardedDraft(null)
        setSave({ saving: false, saved: true, error: null, conflict: null })
      } catch (failure) {
        const conflict = wikiRevisionConflictRevision(failure)
        setSave({
          saving: false,
          saved: false,
          error: conflict === null ? failure : null,
          conflict,
        })
      }
    },
    [applySave, entryId, source]
  )

  const uploadMedia = useCallback(
    async (file: File): Promise<WikiDocumentMediaItem | null> => {
      setUpload({ uploading: true, error: null })
      try {
        const result = await uploadAdminWikiEntryDocumentMedia({
          entryId,
          file,
          altText: file.name,
        }).send()
        setUpload({ uploading: false, error: null })
        return result.media
      } catch (uploadFailure) {
        setUpload({ uploading: false, error: uploadFailure })
        return null
      }
    },
    [entryId]
  )

  const reloadServerVersion = () => {
    setDiscardedDraft(source)
    setSave(IDLE_SAVE)
    reload()
  }

  const requestMode = (next: DocumentEntryMode) => {
    if (next === mode) return
    if (dirty) {
      setPendingMode(next)
      return
    }
    setSelectedMode(next)
  }

  return (
    <div className="flex min-w-0 flex-col">
      <section
        aria-label="内容页编辑模式切换"
        className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div
          role="group"
          aria-label="内容页编辑模式"
          className="flex flex-wrap gap-2"
        >
          {(["structured", "document"] as const).map((candidate) => (
            <Button
              key={candidate}
              type="button"
              variant={mode === candidate ? "default" : "outline"}
              aria-pressed={mode === candidate}
              onClick={() => requestMode(candidate)}
            >
              {DOCUMENT_MODE_LABELS[candidate]}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === storedMode
            ? "切换模式不会删除另一侧的卡片或文档内容。"
            : `当前存档为${DOCUMENT_MODE_LABELS[storedMode]}，保存后切换为${DOCUMENT_MODE_LABELS[mode]}。`}
        </p>
      </section>

      {error ? (
        <div className="p-4">
          <Alert>
            <AlertTitle>文档读取失败</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              {errorMessage(error)}
              <Button type="button" variant="outline" onClick={reload}>
                <RefreshCwIcon data-icon="inline-start" />
                重新加载
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {save.conflict !== null ? (
        <div className="border-b px-4 py-3">
          <Alert role="alert">
            <AlertTitle>文档已被其他管理员修改</AlertTitle>
            <AlertDescription>
              <p>
                服务器当前修订为 r{save.conflict}
                。你的编辑内容仍在编辑器中，没有被丢弃。
                可以重新加载服务器版本，或用当前内容覆盖保存。
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={reloadServerVersion}
                >
                  重新加载服务器版本
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void persist(mode, save.conflict ?? 0)}
                >
                  覆盖保存
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {save.error ? (
        <div className="border-b px-4 py-2">
          <Alert>
            <AlertTitle>保存失败</AlertTitle>
            <AlertDescription>{errorMessage(save.error)}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {discardedDraft !== null ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
          <p className="text-xs text-muted-foreground">
            已加载服务器最新版本；冲突前的草稿仍保留，可以恢复。
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSource(discardedDraft)
              setDiscardedDraft(null)
            }}
          >
            恢复我的草稿
          </Button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : mode === "document" && data ? (
        <WikiDocumentEditor
          key={entryId}
          entryId={entryId}
          entryName={entryName}
          source={source}
          onSourceChange={setSource}
          onReplaceSource={setSource}
          preview={preview}
          categories={categoryOptions}
          coverAssets={coverAssets}
          contentTypes={contentTypes}
          uploading={upload.uploading}
          uploadError={upload.error}
          onUpload={uploadMedia}
          dirty={dirty}
          storedRevision={data.revision}
          revisionsSummary={data.revisionsSummary}
          save={{
            saving: save.saving,
            saved: save.saved,
            onSave: () => void persist(mode, data.revision),
          }}
        />
      ) : (
        <>
          {mode === "structured" && storedMode === "document" && data ? (
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
              <p className="text-xs text-muted-foreground">
                公开页当前按增强 Markdown 文档渲染。保存后恢复结构化卡片渲染，
                文档源码与卡片数据都会保留。
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={save.saving}
                onClick={() => void persist("structured", data.revision)}
              >
                保存为结构化模式
              </Button>
            </div>
          ) : null}
          {structured}
        </>
      )}

      <ConfirmActionDialog
        open={pendingMode !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMode(null)
        }}
        title="切换编辑模式？"
        description="当前文档有未保存的改动。切换模式不会删除另一侧的卡片或文档内容，草稿仍会保留在编辑器中。"
        submitting={false}
        confirmLabel="仍然切换"
        cancelLabel="留在当前模式"
        variant="default"
        onConfirm={() => {
          setSelectedMode(pendingMode)
          setPendingMode(null)
        }}
      />
    </div>
  )
}
