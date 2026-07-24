import { FileImageIcon, ImageUpIcon, LoaderCircleIcon } from "lucide-react"

import { cn } from "~/lib/utils"

import { AdminField } from "./admin-ui"

const imageAccept = "image/png,image/jpeg,image/webp,image/avif"

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export function AdminImageUploadField({
  id,
  name,
  label,
  description,
  file = null,
  disabled = false,
  uploading = false,
  resetAfterSelect = false,
  onSelect,
}: {
  id: string
  name?: string
  label: string
  description: string
  file?: File | null
  disabled?: boolean
  uploading?: boolean
  resetAfterSelect?: boolean
  onSelect: (file: File | null) => void
}) {
  const inactive = disabled || uploading
  const title = uploading ? "正在上传图片" : file ? file.name : "选择一张图片"
  const detail = uploading
    ? "上传完成前请勿关闭页面"
    : file
      ? `${formatFileSize(file.size)} · 点击可重新选择`
      : "从设备中选择 PNG、JPEG、WebP 或 AVIF 文件"

  return (
    <AdminField label={label} htmlFor={id} description={description}>
      <div className="relative min-w-0">
        <input
          id={id}
          name={name}
          type="file"
          accept={imageAccept}
          className="peer sr-only"
          disabled={inactive}
          aria-busy={uploading}
          onChange={(event) => {
            onSelect(event.target.files?.[0] ?? null)
            if (resetAfterSelect) event.target.value = ""
          }}
        />
        <label
          htmlFor={id}
          className={cn(
            "group flex min-h-16 min-w-0 items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-3 transition-[border-color,background-color,box-shadow] peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30",
            inactive
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer hover:border-primary/50 hover:bg-accent/35"
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors group-hover:text-primary">
            {uploading ? (
              <LoaderCircleIcon
                className="size-5 animate-spin"
                aria-hidden="true"
              />
            ) : file ? (
              <FileImageIcon className="size-5" aria-hidden="true" />
            ) : (
              <ImageUpIcon className="size-5" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {detail}
            </span>
          </span>
          <span className="hidden shrink-0 text-xs font-medium text-primary sm:block">
            {uploading ? "上传中" : file ? "更换" : "浏览"}
          </span>
        </label>
      </div>
    </AdminField>
  )
}
