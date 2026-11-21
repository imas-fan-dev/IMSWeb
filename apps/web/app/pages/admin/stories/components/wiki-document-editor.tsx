import { useEffect, useRef, useState } from "react"

import { adminTextareaClass } from "~/components/admin/admin-ui"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import type {
  WikiDocumentWarning,
  WikiStoryContentType,
  WikiStoryCoverAsset,
} from "~/lib/api"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { cn } from "~/lib/utils"
import {
  DocumentPreviewPane,
  DocumentToolbar,
  DocumentWarnings,
} from "./wiki-document-sections"
import { errorMessage } from "./wiki-workbench-model"
import {
  documentMediaSnippet,
  insertDocumentSnippet,
  lineStartOffset,
  type DocumentCategoryOption,
} from "./wiki-document-model"
import type { DocumentPreviewView } from "./wiki-document-hooks"

type EditorPane = "source" | "preview"

type Caret = { start: number; end: number }

/**
 * Split-pane Enhanced Markdown editor for one entry.
 *
 * Wide viewports show source and live preview side by side; narrow viewports
 * collapse to one pane with a 源码 / 预览 switcher. The workspace owns the draft
 * string, so mode switches and reloads never lose unsaved text.
 */
export function WikiDocumentEditor({
  entryId,
  entryName,
  source,
  onSourceChange,
  onReplaceSource,
  preview,
  categories,
  coverAssets,
  contentTypes,
  uploading,
  uploadError,
  onUpload,
  dirty,
  save,
}: {
  entryId: number
  entryName: string
  source: string
  onSourceChange: (next: string) => void
  /** Replaces the whole draft, used by the structured export dialog. */
  onReplaceSource: (next: string) => void
  preview: DocumentPreviewView
  categories: readonly DocumentCategoryOption[]
  coverAssets: readonly WikiStoryCoverAsset[]
  contentTypes: readonly WikiStoryContentType[]
  uploading: boolean
  uploadError: unknown
  onUpload: (file: File) => Promise<{ id: number } | null>
  dirty: boolean
  save: { saving: boolean; saved: boolean; onSave: () => void }
}) {
  const [pane, setPane] = useState<EditorPane>("source")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const caretRef = useRef<Caret>({ start: 0, end: 0 })
  const [focusRequest, setFocusRequest] = useState<{
    start: number
    end: number
    nonce: number
  } | null>(null)
  const nextNonce = useRef(0)
  const handledNonce = useRef(0)

  useEffect(() => {
    if (!focusRequest || handledNonce.current === focusRequest.nonce) return
    handledNonce.current = focusRequest.nonce
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(focusRequest.start, focusRequest.end)
  }, [focusRequest])

  const requestCaret = (caret: Caret) => {
    nextNonce.current += 1
    setFocusRequest({ ...caret, nonce: nextNonce.current })
  }

  const insertSnippet = (snippet: string) => {
    const result = insertDocumentSnippet(
      source,
      caretRef.current.start,
      caretRef.current.end,
      snippet
    )
    onSourceChange(result.source)
    caretRef.current = { start: result.caret, end: result.caret }
    requestCaret(caretRef.current)
  }

  const uploadFile = async (file: File) => {
    const media = await onUpload(file)
    if (media) {
      insertSnippet(documentMediaSnippet({ assetRef: `doc:${media.id}` }))
    }
  }

  const uploadFirstImage = (files: FileList | null | undefined) => {
    const file = Array.from(files ?? []).find((candidate) =>
      candidate.type.startsWith("image/")
    )
    if (file) void uploadFile(file)
  }

  const focusWarningLine = (warning: WikiDocumentWarning) => {
    setPane("source")
    const offset = lineStartOffset(source, warning.line)
    caretRef.current = { start: offset, end: offset }
    requestCaret(caretRef.current)
  }

  return (
    <section
      aria-label="增强 Markdown 文档编辑器"
      className="flex min-w-0 flex-col"
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
          event.preventDefault()
        }
      }}
      onDrop={(event) => {
        const files = event.dataTransfer?.files
        if (!files?.length) return
        event.preventDefault()
        uploadFirstImage(files)
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-medium">{entryName} · 文档源码</h2>
          <p className="text-xs text-muted-foreground">
            支持 CommonMark、GFM 与受控指令块；保存和预览都由服务端编译。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {save.saving
              ? "保存中…"
              : dirty
                ? "未保存改动"
                : save.saved
                  ? "已保存"
                  : "已同步"}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={save.saving}
            onClick={save.onSave}
          >
            保存文档
          </Button>
        </div>
      </header>

      <DocumentToolbar
        entryId={entryId}
        categories={categories}
        coverAssets={coverAssets}
        contentTypes={contentTypes}
        focusReturnRef={textareaRef}
        uploading={uploading}
        onInsert={insertSnippet}
        onReplace={(next) => {
          onReplaceSource(next)
          caretRef.current = { start: next.length, end: next.length }
          requestCaret(caretRef.current)
        }}
        onUpload={(file) => void uploadFile(file)}
      />

      {uploadError ? (
        <div className="border-b px-4 py-2">
          <Alert>
            <AlertTitle>图片上传失败</AlertTitle>
            <AlertDescription>{errorMessage(uploadError)}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-b px-4 py-2 lg:hidden">
        <div role="group" aria-label="切换编辑视图" className="flex gap-2">
          {(["source", "preview"] as const).map((candidate) => (
            <Button
              key={candidate}
              type="button"
              size="sm"
              variant={pane === candidate ? "default" : "outline"}
              aria-pressed={pane === candidate}
              onClick={() => setPane(candidate)}
            >
              {candidate === "source" ? "源码" : "预览"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 lg:grid-cols-2">
        <section
          aria-label="源码面板"
          className={cn(
            "flex min-w-0 flex-col border-b lg:border-r lg:border-b-0",
            pane === "preview" && "hidden lg:flex"
          )}
        >
          <Textarea
            ref={textareaRef}
            aria-label="文档源码"
            value={source}
            onChange={(event) => {
              caretRef.current = {
                start: event.target.selectionStart,
                end: event.target.selectionEnd,
              }
              onSourceChange(event.target.value)
            }}
            onSelect={(event) => {
              caretRef.current = {
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              }
            }}
            onPaste={(event) => {
              const files = event.clipboardData?.files
              if (!files?.length) return
              event.preventDefault()
              uploadFirstImage(files)
            }}
            className={cn(adminTextareaClass, "min-h-96")}
            spellCheck={false}
          />
        </section>
        <div className={cn("min-w-0", pane === "source" && "hidden lg:block")}>
          <DocumentPreviewPane preview={preview} categories={categories} />
        </div>
      </div>

      <DocumentWarnings
        warnings={preview.warnings}
        onSelect={focusWarningLine}
      />
    </section>
  )
}
