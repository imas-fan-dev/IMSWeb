import { useState } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { cn } from "~/lib/utils"

interface NamecardMediaPreviewProps {
  frontImageUrl: string
  backImageUrl: string
  /** 用作 alt 前缀，例如「名片 #792」。 */
  altBase: string
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
  frontImageUrl,
  backImageUrl,
  altBase,
}: NamecardMediaPreviewProps) {
  const [portrait, setPortrait] = useState(false)

  return (
    <div
      className={cn(
        "grid aspect-13/10 gap-px border border-border bg-border",
        portrait ? "grid-cols-2" : "grid-rows-2",
      )}
      data-namecard-orientation={portrait ? "portrait" : "landscape"}
    >
      {[frontImageUrl, backImageUrl].map((image, index) => (
        <NavigationLink
          key={`${image}-${index}`}
          href={image}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden"
        >
          <img
            src={image}
            alt={`${altBase}${index === 0 ? "正面" : "背面"}`}
            loading="lazy"
            decoding="async"
            className="block max-h-full max-w-full border border-foreground/25 object-contain"
            onLoad={(event) => {
              if (index !== 0) return
              const { naturalWidth, naturalHeight } = event.currentTarget
              if (naturalWidth > 0 && naturalHeight > 0) {
                setPortrait(naturalHeight > naturalWidth)
              }
            }}
          />
        </NavigationLink>
      ))}
    </div>
  )
}
