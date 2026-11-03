/**
 * 平台图标统一走 simple-icons 的 CDN（键名即 slug），站点不打包任何本地图标：
 * 自建图标由后台按平台上传，未上传且 CDN 没有的平台回退成首字母圆点。
 */
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

/** 后台/主页共用的取图顺序：上传的图标 → CDN → 没有（调用方回退首字母）。 */
export function platformIconUrl(
  iconKey: string | null,
  uploadedUrl: string | null
): string | null {
  if (uploadedUrl) return uploadedUrl
  if (!iconKey) return null
  return PLATFORM_ICON_URLS[iconKey] ?? null
}
