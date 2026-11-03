/**
 * 平台图标只有两个来源：后台按平台上传的图标，以及 simple-icons 的 CDN；
 * 其余走 simple-icons 的 CDN（键名即 slug）；两者都没有时调用方回退首字母圆点。
 * 后台按平台上传的图标优先级最高，见 `platformIconUrl`。
 */
const LOCAL_PLATFORMS = new Set([
  "million",
  "deremas",
  "shanimas",
  "gakumas",
  "switch",
  "xbox",
])

function simpleIcon(slug: string): string {
  return `https://cdn.simpleicons.org/${slug}`
}

export const PLATFORM_ICON_URLS: Record<string, string> = {
  bilibili: simpleIcon("bilibili"),
  sinaweibo: simpleIcon("sinaweibo"),
  xiaohongshu: simpleIcon("xiaohongshu"),
  x: simpleIcon("x"),
  youtube: simpleIcon("youtube"),
  pixiv: simpleIcon("pixiv"),
  github: simpleIcon("github"),
  steam: simpleIcon("steam"),
  playstation: simpleIcon("playstation"),
}

/** 站内自带的 SVG 是单色的，可以像 CDN 图标一样用遮罩上色。 */
export function isMaskableIcon(iconKey: string | null): boolean {
  return iconKey !== null && LOCAL_PLATFORMS.has(iconKey)
}

/** 取图顺序：上传的图标 → 站内 SVG / CDN → 没有（调用方回退首字母）。 */
export function platformIconUrl(
  iconKey: string | null,
  uploadedUrl: string | null
): string | null {
  if (uploadedUrl) return uploadedUrl
  if (!iconKey) return null
  return PLATFORM_ICON_URLS[iconKey] ?? null
}
