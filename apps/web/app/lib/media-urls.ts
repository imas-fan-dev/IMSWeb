
/**
 * 同一张图的小图版本：媒体路由会用 `?thumb=1` 提供 600px 副本，
 * 没有小图时服务端回退原图，所以可以无脑加。
 */
export function withThumbnail(url: string): string {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return url
  if (/[?&]thumb=1\b/.test(url)) return url
  return `${url}${url.includes("?") ? "&" : "?"}thumb=1`
}
