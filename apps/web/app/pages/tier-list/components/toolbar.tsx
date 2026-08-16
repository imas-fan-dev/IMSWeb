import {
  DownloadIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { cn } from "~/lib/utils"
import type { TierListActions } from "../hooks/use-tier-list-state"
import { exportTierListPng } from "../tier-list-export"
import type { TierListDocument } from "../tier-list-model"

const SCALE_OPTIONS = [
  { scale: 1, label: "1x", detail: "约 1200px" },
  { scale: 2, label: "2x", detail: "约 2400px" },
  { scale: 3, label: "3x", detail: "约 3600px" },
] as const

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function exportFileName(title: string) {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .slice(0, 60)
  return `${cleaned || "tier-list"}.png`
}

function ExportPopover({ document }: { document: TierListDocument }) {
  const { resolvedTheme } = useTheme()
  const [scale, setScale] = useState<1 | 2 | 3>(2)
  const [includePool, setIncludePool] = useState(true)
  const [darkBackground, setDarkBackground] = useState(resolvedTheme === "dark")
  const [exporting, setExporting] = useState(false)
  const totalItems =
    document.pool.length +
    document.tiers.reduce(
      (sum, tier) => sum + (document.rows[tier.id]?.length ?? 0),
      0
    )

  async function handleExport() {
    setExporting(true)
    try {
      const { blob, failedCount } = await exportTierListPng(
        document,
        { includePool, darkBackground },
        scale
      )
      downloadBlob(blob, exportFileName(document.title))
      toast.success("导出成功", {
        description:
          failedCount > 0
            ? `PNG 已下载，但有 ${failedCount} 张图片未能加载，已用占位符代替。`
            : `PNG 已下载（约 ${Math.round(blob.size / 1024)} KiB）。`,
      })
    } catch {
      toast.error("导出失败", { description: "图片渲染出错，请稍后重试。" })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="secondary" disabled={totalItems === 0}>
            <DownloadIcon aria-hidden="true" className="size-4" />
            导出图片
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <PopoverTitle className="mb-3">导出 PNG</PopoverTitle>

        <div className="mb-3">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            分辨率
          </span>
          <div
            className="grid grid-cols-3 gap-1.5"
            role="radiogroup"
            aria-label="导出分辨率"
          >
            {SCALE_OPTIONS.map((option) => (
              <button
                key={option.scale}
                type="button"
                role="radio"
                aria-checked={scale === option.scale}
                onClick={() => setScale(option.scale)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  scale === option.scale
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-muted"
                )}
              >
                <span className="block text-sm font-semibold">
                  {option.label}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {option.detail}
                </span>
              </button>
            ))}
          </div>
        </div>

        <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={includePool}
            onCheckedChange={(checked) => setIncludePool(checked === true)}
          />
          包含「未分类」区域
        </label>
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={darkBackground}
            onCheckedChange={(checked) => setDarkBackground(checked === true)}
          />
          深色背景
        </label>

        <Button
          type="button"
          className="w-full"
          disabled={exporting}
          onClick={() => void handleExport()}
          data-testid="export-png-button"
        >
          {exporting ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-4 animate-spin"
            />
          ) : (
            <DownloadIcon aria-hidden="true" className="size-4" />
          )}
          {exporting ? "正在渲染…" : "下载 PNG"}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function ClearAllButton({ onClear }: { onClear: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="ghost" aria-label="清空排行榜">
            <Trash2Icon aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">清空</span>
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>清空整个排行榜？</AlertDialogTitle>
          <AlertDialogDescription>
            所有层级中的头像和未分类图片都会被移除，层级和标题会保留。此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onClear}>
            清空
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function TierListToolbar({
  document,
  actions,
  onOpenImport,
}: {
  document: TierListDocument
  actions: TierListActions
  onOpenImport: () => void
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <label className="flex min-w-0 items-center gap-2">
        <span className="sr-only">排行榜标题</span>
        <Input
          value={document.title}
          onChange={(event) => actions.setTitle(event.target.value)}
          placeholder="排行榜标题"
          className="w-44 font-medium sm:w-72"
          aria-label="排行榜标题"
        />
      </label>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={actions.addTier}>
          <PlusIcon aria-hidden="true" className="size-4" />
          添加层级
        </Button>
        <Button type="button" onClick={onOpenImport}>
          <ImagePlusIcon aria-hidden="true" className="size-4" />
          导入图片
        </Button>
        <ExportPopover document={document} />
        <ClearAllButton onClear={actions.clearAll} />
      </div>
    </div>
  )
}
