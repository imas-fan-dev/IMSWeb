import type { LucideIcon } from "lucide-react"
import { FileUpIcon, LoaderCircleIcon, UploadIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export type FileUploadControlProps = {
  id: string
  accept: string
  emptyTitle: string
  emptyDetail: string
  fileKind: string
  onSelect: (file: File | null) => void
  name?: string
  file?: File | null
  disabled?: boolean
  uploading?: boolean
  required?: boolean
  resetAfterSelect?: boolean
  invalid?: boolean
  invalidLabel?: string | null
  dropZoneLabel?: string
  dropTitle?: string
  selectedIcon?: LucideIcon
  emptyIcon?: LucideIcon
}

export function FileUploadControl({
  id,
  name,
  accept,
  emptyTitle,
  emptyDetail,
  fileKind,
  file = null,
  disabled = false,
  uploading = false,
  required = false,
  resetAfterSelect = false,
  invalid = false,
  invalidLabel,
  dropZoneLabel = `${fileKind}文件选择`,
  dropTitle = `松开以选择${fileKind}`,
  selectedIcon: SelectedIcon = FileUpIcon,
  emptyIcon: EmptyIcon = UploadIcon,
  onSelect,
}: FileUploadControlProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const inactive = disabled || uploading

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = ""
  }, [file])

  function selectFile(selectedFile: File | null) {
    setDragging(false)
    onSelect(selectedFile)
    if (resetAfterSelect && inputRef.current) inputRef.current.value = ""
  }

  function clearFile() {
    if (inputRef.current) inputRef.current.value = ""
    selectFile(null)
  }

  const title = uploading
    ? `正在上传${fileKind}`
    : dragging
      ? dropTitle
      : file?.name || emptyTitle
  const detail = uploading
    ? "上传完成前请勿关闭页面"
    : file
      ? `${fileKind} · ${formatFileSize(file.size)}`
      : emptyDetail

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        className="peer sr-only"
        disabled={inactive}
        aria-busy={uploading}
        aria-required={required}
        aria-invalid={invalid}
        onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)}
      />
      <div
        role="group"
        aria-label={dropZoneLabel}
        className={cn(
          "flex min-h-24 min-w-0 flex-col justify-center gap-4 rounded-lg border border-dashed bg-muted/25 p-4 transition-[border-color,background-color,box-shadow] peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30 sm:flex-row sm:items-center",
          dragging && "border-primary bg-accent/45 ring-3 ring-ring/20",
          invalid && "border-destructive/50 bg-destructive/5",
          inactive
            ? "cursor-not-allowed opacity-60"
            : "hover:border-primary/50 hover:bg-accent/35"
        )}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!inactive) setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!inactive) event.dataTransfer.dropEffect = "copy"
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget
          if (
            nextTarget instanceof Node &&
            event.currentTarget.contains(nextTarget)
          ) {
            return
          }
          setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (inactive) return
          selectFile(event.dataTransfer.files?.[0] ?? null)
        }}
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground",
            file && !invalid && "text-primary",
            invalid && "text-destructive"
          )}
        >
          {uploading ? (
            <LoaderCircleIcon
              className="size-5 animate-spin"
              aria-hidden="true"
            />
          ) : dragging ? (
            <UploadIcon className="size-5" aria-hidden="true" />
          ) : file ? (
            <SelectedIcon className="size-5" aria-hidden="true" />
          ) : (
            <EmptyIcon className="size-5" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1" aria-live="polite">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p
              className="min-w-0 flex-1 truncate text-sm font-medium"
              title={title}
            >
              {title}
            </p>
            {uploading ? (
              <Badge variant="secondary">上传中</Badge>
            ) : file ? (
              <Badge variant={invalid ? "destructive" : "secondary"}>
                {invalidLabel || (invalid ? "不可用" : "已选择")}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs/5 text-muted-foreground">
            {detail}
          </p>
        </div>

        {!uploading ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={inactive}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon data-icon="inline-start" />
              {file ? "更换" : "选择文件"}
            </Button>
            {file ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={inactive}
                aria-label={`移除 ${file.name}`}
                title="移除已选择的文件"
                onClick={clearFile}
              >
                <XIcon />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
