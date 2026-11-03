/**
 * 平台图标只有两个来源：后台按平台上传的图标，以及 simple-icons 的 CDN。
 * 图标键直接当作 slug 请求，所以新加的平台不必先改前端也能取到图；
 * 两者都没有时调用方回退首字母圆点。
 */
export function platformIconUrl(
  iconKey: string | null,
  uploadedUrl: string | null
): string | null {
  if (uploadedUrl) return uploadedUrl
  const slug = iconKey?.trim()
  if (!slug) return null
  return `https://cdn.simpleicons.org/${encodeURIComponent(slug)}`
}
