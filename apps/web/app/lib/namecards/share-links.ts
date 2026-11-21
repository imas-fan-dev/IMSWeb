/**
 * 分享页在站点内的地址：单卡 `/exchange/card/<slug>`、快速清单 `/exchange/<handle>`。
 *
 * 纯字符串拼装，分享页（登录回跳、分享人主页）与分享弹窗（二维码里的绝对链接）
 * 都读这一份，避免两处各写一套路径。
 */

export const NAMECARD_MANAGE_HREF = "/account/me/namecards"

/** 单张名片的分享页路径（`slug` 由属主侧 share-link 接口给出）。 */
export function cardSharePath(slug: string): string {
  return `/exchange/card/${encodeURIComponent(slug)}`
}

/** 快速交换清单的分享页路径；`handle` 可以是 uid、主页地址或账号 ID。 */
export function quickSharePath(handle: string): string {
  return `/exchange/${encodeURIComponent(handle)}`
}

/**
 * 分享人的公开主页：与 `GET /user/<accountId>` 同口径，优先用户设置的公开地址，
 * 没设置时退回数字编号（快速清单直接用它的 `handle`，服务端三种都认）。
 */
export function shareOwnerProfileHref(owner: {
  pageSlug?: string | null
  uid: number
}): string {
  const slug = owner.pageSlug?.trim()
  return `/user/${encodeURIComponent(slug || String(owner.uid))}`
}
