import { ImagePlusIcon, LoaderCircleIcon } from "lucide-react"
import { useRef } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { WikiDocumentRenderer } from "~/components/wiki/wiki-document-renderer"
import type {
  WikiDocumentWarning,
  WikiPublicStoryCategory,
  WikiPublicStoryDocument,
  WikiStoryCoverAsset,
} from "~/lib/api"
import { errorMessage } from "./wiki-workbench-model"
import {
  DOCUMENT_INSERT_TEMPLATES,
  documentMediaSnippet,
  sortedDocumentWarnings,
  storyCategorySnippet,
  type DocumentCategoryOption,
} from "./wiki-document-model"

/**
 * Right-hand live preview of the server-compiled document.
 *
 * The pane renders the shared `WikiDocumentRenderer`, so the workbench shows
 * exactly the AST the public Modern and Classic pages receive.
 */
export function DocumentPreviewPane({
  preview,
  categories,
}: {
  preview: {
    document: WikiPublicStoryDocument | null
    loading: boolean
    stale: boolean
    error: unknown
  }
  categories: readonly DocumentCategoryOption[]
}) {
  const document = preview.document
  const renderCategories: WikiPublicStoryCategory[] = categories.map(
    (category) => ({ name: category.name, cards: [] })
  )
  return (
    <section
      aria-label="文档预览"
      className="flex min-h-96 min-w-0 flex-col bg-muted/10"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h3 className="text-xs font-medium text-muted-foreground">实时预览</h3>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {preview.loading
            ? "编译中…"
            : preview.stale
              ? "等待编译…"
              : "已与源码同步"}
        </span>
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto p-4">
        {preview.error ? (
          <Alert>
            <AlertTitle>预览编译失败</AlertTitle>
            <AlertDescription>{errorMessage(preview.error)}</AlertDescription>
          </Alert>
        ) : null}
        {document && document.blocks.length ? (
          <WikiDocumentRenderer
            document={document}
            categories={renderCategories}
            renderStoryCategory={({ category }) => {
              const option = categories.find(
                (candidate) => candidate.name === category.name
              )
              return (
                <div className="mt-6 rounded-lg border border-dashed px-4 py-3 text-sm">
                  <p className="font-medium">嵌入分类「{category.name}」</p>
                  <p className="text-xs text-muted-foreground">
                    公开页将在这里铺开该分类的 {option?.cardCount ?? 0} 张卡片
                  </p>
                </div>
              )
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            还没有可预览的内容，开始写 Markdown 或从工具栏插入块。
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * Line-numbered compiler diagnostics.
 *
 * Each row is a button: activating it focuses the source editor on that line so
 * a maintainer can fix the reported problem without searching for it.
 */
export function DocumentWarnings({
  warnings,
  onSelect,
}: {
  warnings: readonly WikiDocumentWarning[]
  onSelect: (warning: WikiDocumentWarning) => void
}) {
  const rows = sortedDocumentWarnings(warnings)
  return (
    <div className="border-t px-4 py-3">
      <h3 className="text-xs font-medium text-muted-foreground">
        编译告警 {rows.length ? `(${rows.length})` : ""}
      </h3>
      {rows.length ? (
        <ul aria-label="编译告警" className="mt-2 flex flex-col gap-1">
          {rows.map((warning, index) => (
            <li key={`${warning.line}-${warning.code}-${index}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs text-destructive hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onSelect(warning)}
              >
                <span className="shrink-0 font-mono tabular-nums">
                  第 {warning.line} 行
                </span>
                <span className="min-w-0">{warning.message}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">暂无编译告警</p>
      )}
    </div>
  )
}

/**
 * Quick-insert toolbar for block templates, the entry's own structured
 * categories, agency shared covers, and document image uploads.
 *
 * Selecting a category or cover inserts its directive at the caret and leaves
 * the picker unselected, so repeating the action never needs a "reset" step.
 */
export function DocumentToolbar({
  categories,
  coverAssets,
  uploading,
  onInsert,
  onUpload,
}: {
  categories: readonly DocumentCategoryOption[]
  coverAssets: readonly WikiStoryCoverAsset[]
  uploading: boolean
  onInsert: (snippet: string) => void
  onUpload: (file: File) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      role="toolbar"
      aria-label="快捷插入"
      className="flex flex-wrap items-center gap-2 border-b px-4 py-2"
    >
      {DOCUMENT_INSERT_TEMPLATES.map((template) => (
        <Button
          key={template.id}
          type="button"
          size="sm"
          variant="outline"
          aria-label={`插入${template.label}`}
          title={template.description}
          onClick={() => onInsert(template.snippet)}
        >
          {template.label}
        </Button>
      ))}

      <Select
        items={categories.map((category) => ({
          label: category.name,
          value: category.name,
        }))}
        value=""
        onValueChange={(value) => {
          if (value) onInsert(storyCategorySnippet(String(value)))
        }}
      >
        <SelectTrigger size="sm" aria-label="插入分类嵌入" className="w-40">
          <SelectValue>{() => "插入分类嵌入"}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {categories.map((category) => (
              <SelectItem
                key={category.name}
                value={category.name}
                aria-label={category.name}
              >
                {category.name}（{category.cardCount} 张）
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        items={coverAssets.map((asset) => ({
          label: asset.name,
          value: String(asset.id),
        }))}
        value=""
        onValueChange={(value) => {
          if (value)
            onInsert(documentMediaSnippet({ assetRef: `cover:${value}` }))
        }}
      >
        <SelectTrigger size="sm" aria-label="插入共享封面" className="w-40">
          <SelectValue>{() => "插入共享封面"}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {coverAssets.map((asset) => (
              <SelectItem
                key={asset.id}
                value={String(asset.id)}
                aria-label={asset.name}
              >
                {asset.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
        ) : (
          <ImagePlusIcon data-icon="inline-start" />
        )}
        上传图片
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label="选择图片文件"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onUpload(file)
          event.target.value = ""
        }}
      />
    </div>
  )
}
