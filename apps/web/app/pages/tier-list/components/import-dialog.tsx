import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import type { TierItem } from "../tier-list-model"
import { LocalImportTab } from "./import-local-tab"

export function ImportDialog({
  open,
  onOpenChange,
  existingItems,
  onAddItems,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingItems: Record<string, TierItem>
  onAddItems: (items: readonly TierItem[]) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>导入图片</DialogTitle>
          <DialogDescription>
            上传本机图片。所有图片只保存在浏览器本地，不会上传到服务器。
          </DialogDescription>
        </DialogHeader>
        <LocalImportTab existingItems={existingItems} onAddItems={onAddItems} />
      </DialogContent>
    </Dialog>
  )
}
