import { Skeleton } from "~/components/ui/skeleton"

/**
 * 名片队列首屏骨架：形状对齐真实卡片的 `aspect-13/10` 缩略图容器，
 * 免得加载完成时列表整体跳一次高度。
 */
export function NamecardQueueSkeleton() {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4"
      aria-label="正在加载名片队列"
    >
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="aspect-13/10 w-full rounded-xl" />
      ))}
    </div>
  )
}
