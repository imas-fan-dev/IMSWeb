/**
 * 名片页面的统一编号：正面、中间页、背面。
 *
 * 单页名片只有正面；双页名片直接叫正面与背面；中间页按顺序编号。
 * 画廊角标、全屏预览的标题与缩略图条都用这一份，避免各写一套文案。
 */
export interface NamecardPage {
  /** 稳定的 key，图片地址变化时也能正确重置预览状态。 */
  key: string
  url: string
  /** 缩略图条用小图；没有缩略图时退回原图。 */
  thumb: string
  label: string
}

export function namecardPageLabel(position: number, total: number): string {
  if (total < 2 || position === 0) return "正面"
  if (position === total - 1) return "背面"
  return `中间页 ${position}`
}

/** 画廊只给双面及以上的名片标角标，单页名片不显示多余标签。 */
export function mediaSlotRole(position: number, total: number): string | null {
  return total < 2 ? null : namecardPageLabel(position, total)
}

export function namecardPages(card: {
  /** 统一布局的页面：唯一的主图来源，正/反/中间由页序推导。 */
  pages?: readonly {
    pageId: string
    url: string
    thumbUrl: string
  }[]
}): NamecardPage[] {
  const pages = card.pages ?? []
  return pages.map((page, index) => ({
    key: page.pageId,
    url: page.url,
    thumb: page.thumbUrl,
    label: namecardPageLabel(index, pages.length),
  }))
}
