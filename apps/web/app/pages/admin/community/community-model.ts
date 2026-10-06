import {
  communityContentEntrySchema,
  type CommunityContentEntry,
} from "~/lib/api"

export const audienceLabel = { all: "全部", web: "Web", app: "App" }
export const availabilityLabel = {
  always: "始终展示",
  exchange: "交换功能开放时展示",
}
export function newCommunityEntry(): CommunityContentEntry {
  return {
    id: `entry-${crypto.randomUUID()}`,
    title: "新入口",
    description: "",
    href: "/community",
    icon: "users",
    imageUrl: null,
    enabled: true,
    audience: "all",
    availability: "always",
  }
}
export function sameContent(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}
export function validateCandidate(
  candidate: CommunityContentEntry,
  entries: CommunityContentEntry[],
  originalId: string | null
) {
  const result = communityContentEntrySchema.safeParse(candidate)
  if (!result.success)
    return result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("；")
  if (!candidate.title.trim()) return "请填写名称。"
  if (
    entries.some(
      (entry) => entry.id !== originalId && entry.id === candidate.id
    )
  )
    return "入口 ID 已存在，请使用其他 ID。"
  if (originalId !== null && !entries.some((entry) => entry.id === originalId))
    return "原入口已不存在，请保留内容并重新核对。"
  if (originalId === null && entries.length >= 100)
    return "最多添加 100 个入口。"
  return ""
}
