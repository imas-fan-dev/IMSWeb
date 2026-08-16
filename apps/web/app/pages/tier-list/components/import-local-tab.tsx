import { ImagePlusIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { createTierItem, type TierItem } from "../tier-list-model"
import { compressImageFile, labelFromFileName } from "../tier-list-local-image"

const MAX_FILE_BYTES = 20 * 1024 * 1024
const acceptedTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
]

type PickedFile = {
  file: File
  label: string
  previewUrl: string
}

type ProcessedFile = PickedFile & {
  dataUrl: string
  failed: boolean
}

type LocalImportTabProps = {
  existingItems: Record<string, TierItem>
  onAddItems: (items: readonly TierItem[]) => void
}

export function LocalImportTab({
  existingItems,
  onAddItems,
}: LocalImportTabProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef(new Set<string>())
  const [processing, setProcessing] = useState(false)
  const [processed, setProcessed] = useState<ProcessedFile[]>([])

  useEffect(() => {
    const previewUrls = previewUrlsRef.current
    return () => {
      // Entries are revoked when removed/added; this covers dialog unmount.
      for (const url of previewUrls) URL.revokeObjectURL(url)
      previewUrls.clear()
    }
  }, [])

  function pickFiles(files: FileList | File[]) {
    const accepted = [...files].filter(
      (file) => acceptedTypes.includes(file.type) && file.size <= MAX_FILE_BYTES
    )
    const skipped = [...files].length - accepted.length
    const picked: PickedFile[] = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      previewUrlsRef.current.add(previewUrl)
      return { file, label: labelFromFileName(file.name), previewUrl }
    })
    if (picked.length === 0) {
      toast.error("没有可导入的图片", {
        description:
          "支持 PNG、JPEG、WebP、GIF、AVIF 或 BMP，单张不超过 20 MiB。",
      })
      return
    }
    void processFiles(picked)
    if (skipped > 0) {
      toast.warning(`${skipped} 个文件被跳过`, {
        description: "仅支持常见图片格式，单张不超过 20 MiB。",
      })
    }
  }

  async function processFiles(picked: PickedFile[]) {
    setProcessing(true)
    try {
      const results = await Promise.all(
        picked.map(async (entry) => {
          const compressed = await compressImageFile(entry.file)
          return {
            ...entry,
            dataUrl: compressed?.dataUrl ?? "",
            failed: compressed === null,
          }
        })
      )
      setProcessed((current) => [...current, ...results])
    } finally {
      setProcessing(false)
    }
  }

  function removeEntry(entry: ProcessedFile) {
    URL.revokeObjectURL(entry.previewUrl)
    previewUrlsRef.current.delete(entry.previewUrl)
    setProcessed((current) => current.filter((item) => item !== entry))
  }

  function addProcessed() {
    const usable = processed.filter((entry) => !entry.failed)
    const existingSources = new Set(
      Object.values(existingItems).map((item) => item.src)
    )
    const items = usable
      .filter((entry) => !existingSources.has(entry.dataUrl))
      .map((entry) => createTierItem(entry.dataUrl, entry.label, "local"))
    const duplicates = usable.length - items.length
    onAddItems(items)
    for (const entry of usable) {
      URL.revokeObjectURL(entry.previewUrl)
      previewUrlsRef.current.delete(entry.previewUrl)
    }
    setProcessed([])
    toast.success(`已添加 ${items.length} 张图片`, {
      description:
        duplicates > 0
          ? `其中 ${duplicates} 张已在列表中，已跳过。`
          : "它们已进入「未分类」，拖拽即可开始分级。",
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="选择本机图片文件"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          pickFiles(event.dataTransfer.files)
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-foreground/15 py-10 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        data-testid="local-upload-dropzone"
      >
        <ImagePlusIcon aria-hidden="true" className="size-6" />
        <span className="text-sm font-medium">
          点击选择或多张图片拖放到这里
        </span>
        <span className="text-xs text-muted-foreground/70">
          PNG、JPEG、WebP、GIF、AVIF 或 BMP · 单张不超过 20 MiB ·
          自动压缩后仅保存在浏览器本地
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) pickFiles(event.target.files)
            event.target.value = ""
          }}
        />
      </div>

      {processing ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-4 animate-spin"
          />
          正在压缩图片…
        </div>
      ) : null}

      {processed.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
            {processed.map((entry) => (
              <div
                key={entry.previewUrl}
                className={cn(
                  "relative overflow-hidden rounded-lg border ring-1 ring-foreground/10",
                  entry.failed && "opacity-60"
                )}
                data-testid="local-pending-item"
              >
                {entry.failed ? (
                  <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
                    无法读取
                  </div>
                ) : (
                  <img
                    src={entry.dataUrl}
                    alt={entry.label}
                    className="aspect-square w-full object-cover"
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-xs text-white">
                  {entry.label}
                </span>
                <button
                  type="button"
                  aria-label={`移除 ${entry.label}`}
                  onClick={() => removeEntry(entry)}
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/50 text-white hover:bg-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <XIcon aria-hidden="true" className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">
              {processed.filter((entry) => !entry.failed).length} 张待添加
              {processed.some((entry) => entry.failed)
                ? "（部分图片无法读取）"
                : ""}
            </span>
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              onClick={addProcessed}
              data-testid="add-local-files"
            >
              添加到列表
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
