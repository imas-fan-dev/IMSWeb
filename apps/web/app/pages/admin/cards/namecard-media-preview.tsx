import { ImagesIcon } from "lucide-react"
import { useState } from "react"
import type { CSSProperties } from "react"

import { CardImage } from "~/components/shared/card-image"
import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

interface NamecardMediaPreviewPage {
  role: "front" | "middle" | "back"
  thumbUrl: string
}

interface NamecardMediaPreviewProps {
  /** 用作 alt 前缀，例如「名片 #792」。 */
  altBase: string
  /** 统一页面行：正/反/中间由页序推导，是唯一的图片来源。 */
  pages?: readonly NamecardMediaPreviewPage[]
  /** 总页数；超过两张（有中间页）时在角落标出，预览本身只画正反面。 */
  pageCount?: number
  /** Draft rotation proposal; CSS-only preview, front/back by role. */
  rotations?: Readonly<{ front?: number; back?: number }>
}

/**
 * 管理页的名片正反面预览。
 *
 * 名片多为 90×50 或 90×54 mm，因此不做固定宽高比裁切（`object-contain` 会留黑边/白边），直接按图片
 * 原始比例铺满容器，保证「整张名片都看得见」。
 *
 * 排列方式跟随**正面**构图：横版上下排列（两面各自占满宽度），竖版左右排列（两面各占一半宽度）。
 * 正反面构图不一致时以正面为准，所以只在正面加载完成时读取方向，背面不参与判定。
 *
 * 容器高度固定（`aspect-13/10`，同一行卡片等宽即等高），比容器矮/窄的一面在格子内居中，
 * 空白处露出的就是分隔线与边框的颜色，这样每张卡片底部的说明与操作按钮永远对齐。
 *
 * 缩略图自身另有一圈描边（`border-foreground/25`），避免名片主色与卡片底色接近时看不出边界。
 */
export function NamecardMediaPreview({
  altBase,
  pages,
  pageCount,
  rotations,
}: NamecardMediaPreviewProps) {
  const [portrait, setPortrait] = useState(false)
  const resolvedFront =
    pages?.find((page) => page.role === "front")?.thumbUrl ?? ""
  const resolvedBack =
    pages?.find((page) => page.role === "back")?.thumbUrl ?? null
  const images = resolvedBack ? [resolvedFront, resolvedBack] : [resolvedFront]
  const resolvedPageCount = pages?.length ?? pageCount
  const rotationTurns = (index: number) => {
    const raw =
      index === 0
        ? (rotations?.front ?? 0)
        : index === images.length - 1
          ? (rotations?.back ?? 0)
          : 0
    return ((raw % 4) + 4) % 4
  }
  const rotationStyle = (index: number): CSSProperties | undefined => {
    const turns = rotationTurns(index)
    if (!turns) return undefined
    return {
      transform: `rotate(${turns * 90}deg) scale(${turns % 2 === 1 ? 0.72 : 1})`,
    }
  }

  return (
    <div
      className={cn(
        "relative grid aspect-13/10 gap-px border border-border bg-border",
        images.length === 1
          ? "grid-rows-1"
          : portrait
            ? "grid-cols-2"
            : "grid-rows-2"
      )}
      data-namecard-orientation={portrait ? "portrait" : "landscape"}
    >
      {resolvedPageCount && resolvedPageCount > 2 ? (
        <Badge className="absolute top-2 right-2 z-10 gap-1 border-border bg-background/90 text-foreground shadow-sm">
          <ImagesIcon aria-hidden="true" />
          {resolvedPageCount}
        </Badge>
      ) : null}
      {[...images].map((image, index) => (
        <div
          key={`${image}-${index}`}
          className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden"
        >
          <CardImage
            src={image}
            alt={`${altBase}${index === 0 ? "正面" : "背面"}`}
            loading="lazy"
            decoding="async"
            className="block max-h-full max-w-full border border-foreground/25 object-contain"
            style={rotationStyle(index)}
            onLoad={(event) => {
              if (index !== 0) return
              const { naturalWidth, naturalHeight } = event.currentTarget
              if (naturalWidth > 0 && naturalHeight > 0) {
                setPortrait(naturalHeight > naturalWidth)
              }
            }}
          />
        </div>
      ))}
    </div>
  )
}
