import qrcode from "qrcode-generator"

import { resolveShareableOrigin, type PlatformProfile } from "~/lib/api"
import {
  cardSharePath,
  quickSharePath,
  scanSharePath,
} from "~/lib/namecards/share-links"

/**
 * 分享名片的纯逻辑：链接、二维码矩阵、canvas 绘制、导出与剪贴板。组件只做接线，
 * 所以这些东西都能脱离 DOM 单测（绘制只依赖传入的 canvas）。
 *
 * 两种分享：快速交换清单（`<站点>/exchange/<handle>`，名片管理工具栏）与单张名片
 * （`<站点>/exchange/card/<slug>`，个人主页瓦片与名片详情窗，slug 来自属主侧
 * `share-link` 接口）。面板只认 `NamecardShareTarget`，两种链接共用同一套二维码、
 * 复制与下载逻辑。
 */

/** 导出用的 canvas 边长（像素）；显示尺寸由组件用 class 收窄。 */
export const QR_CANVAS_SIZE = 512

/** 二维码四周的静默区，单位是模块（规范要求至少 4 个）。 */
export const QR_QUIET_ZONE = 4

/** 空快速清单时工具栏给出的引导文案（tooltip 与测试共用同一份字面量）。 */
export const SHARE_EMPTY_HINT = "先去编辑模式添加快速交换名片"

/**
 * 分享链接里的 handle：优先用用户设置的公开主页地址，没设置时退回数字编号。
 * 与 `GET /user/<accountId>` 同口径——服务端按 uid / page_slug / account_id 依次匹配。
 */
export function shareHandleFor(
  profile: Pick<PlatformProfile, "pageSlug" | "uid">
): string {
  return profile.pageSlug ?? String(profile.uid)
}

/**
 * 分享链接（快速交换清单）。`handle` 本来只含主页地址允许的字符或纯数字，仍然转义一次，
 * 免得异常数据把链接拼坏。
 */
export function shareLinkFor(
  handle: string,
  origin = resolveShareableOrigin()
): string {
  return `${origin.replace(/\/+$/u, "")}${quickSharePath(handle)}`
}

/**
 * 一次性交换码的站点链接：二维码里放这个，任何扫码器都能看出站点与用途。
 * 落地页由 `/exchange/scan/:token` 承接。
 */
export function scanShareLinkFor(
  token: string,
  origin = resolveShareableOrigin()
): string {
  return `${origin.replace(/\/+$/u, "")}${scanSharePath(token)}`
}

/** 单张名片的分享链接；`slug` 是属主侧 `share-link` 接口回的 12 位短链。 */
export function cardShareLinkFor(
  slug: string,
  origin = resolveShareableOrigin()
): string {
  return `${origin.replace(/\/+$/u, "")}${cardSharePath(slug)}`
}

/** 下载文件名：`imsweb-exchange-<handle>.png`。 */
export function shareImageFileName(handle: string): string {
  return `imsweb-exchange-${handle}.png`
}

/** 单卡分享图的下载文件名：`imsweb-namecard-<slug>.png`。 */
export function cardShareImageFileName(slug: string): string {
  return `imsweb-namecard-${slug}.png`
}

/** 分享面板要展示与导出的全部内容：链接、文件名、标题与说明。 */
export interface NamecardShareTarget {
  /** 要分享的完整链接（二维码与「复制链接」都用它）。 */
  link: string
  /** 下载二维码图片时的文件名。 */
  fileName: string
  title: string
  description: string
}

const QUICK_SHARE_TITLE = "分享名片"
const QUICK_SHARE_DESCRIPTION = "扫码或把链接发给对方，就能打开你的快速交换名片。"
const CARD_SHARE_TITLE = "分享这张名片"
const CARD_SHARE_DESCRIPTION = "扫码或把链接发给对方，就能打开这张名片的分享页。"

/** 快速交换清单的分享目标（名片管理工具栏）。 */
export function quickShareTarget(
  handle: string,
  origin = resolveShareableOrigin()
): NamecardShareTarget {
  return {
    link: shareLinkFor(handle, origin),
    fileName: shareImageFileName(handle),
    title: QUICK_SHARE_TITLE,
    description: QUICK_SHARE_DESCRIPTION,
  }
}

/** 单张名片的分享目标（个人主页瓦片、名片详情窗）。 */
export function cardShareTarget(
  slug: string,
  origin = resolveShareableOrigin()
): NamecardShareTarget {
  return {
    link: cardShareLinkFor(slug, origin),
    fileName: cardShareImageFileName(slug),
    title: CARD_SHARE_TITLE,
    description: CARD_SHARE_DESCRIPTION,
  }
}

/**
 * 二维码模块矩阵：`matrix[row][column]`，边长是 `qrcode-generator` 自动选定的模块数
 * （`typeNumber 0` + 纠错等级 M）。
 */
export function qrMatrix(link: string): boolean[][] {
  const code = qrcode(0, "M")
  code.addData(link)
  code.make()
  const count = code.getModuleCount()
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, column) => code.isDark(row, column))
  )
}

/**
 * 把矩阵画到 canvas：白底 + 黑色模块 + 静默区。模块取整到整数像素并整体居中，
 * 避免半像素带来的模糊。取不到 2d 上下文（jsdom 没装 canvas 实现）时直接跳过绘制，
 * 元素本身照常渲染。
 */
export function drawQrCode(
  canvas: HTMLCanvasElement,
  matrix: readonly (readonly boolean[])[],
  size = QR_CANVAS_SIZE
): void {
  const context = canvas.getContext("2d")
  const count = matrix.length
  if (!context || count === 0) return
  canvas.width = size
  canvas.height = size
  const cell = Math.max(1, Math.floor(size / (count + QR_QUIET_ZONE * 2)))
  const extent = cell * (count + QR_QUIET_ZONE * 2)
  const offset = Math.floor((size - extent) / 2) + cell * QR_QUIET_ZONE
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, size, size)
  context.fillStyle = "#000000"
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (!matrix[row]?.[column]) continue
      context.fillRect(offset + column * cell, offset + row * cell, cell, cell)
    }
  }
}

/** 把当前 canvas 导成 PNG；`toBlob` 没给出结果（环境不支持）时 reject，由调用方提示。 */
export function canvasPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const { promise, resolve, reject } = Promise.withResolvers<Blob>()
  canvas.toBlob((blob) => {
    if (blob) resolve(blob)
    else reject(new Error("导出分享图片失败"))
  }, "image/png")
  return promise
}

/** 触发浏览器下载（与名牌单导出 `tier-list/components/toolbar.tsx` 的 `downloadBlob` 同做法）。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * 写剪贴板。不可用（无权限、非安全上下文、旧浏览器）时返回 `false`，
 * 由调用方降级成「选中链接文本」，不弹 alert。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** 选中节点里的文本：剪贴板不可用时的降级手段。 */
export function selectText(node: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
}
