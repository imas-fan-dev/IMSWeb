import {
  BookOpenIcon,
  CircleEllipsisIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import type { WikiEntryKind, WikiStoryEntrySubtype } from "~/lib/api"

export const wikiEntryKindOptions = [
  {
    value: "idol",
    label: "偶像",
    description: "个人偶像或角色资料",
    icon: UserRoundIcon,
  },
  {
    value: "unit",
    label: "组合",
    description: "Unit、团体或组合资料",
    icon: UsersRoundIcon,
  },
  {
    value: "story",
    label: "剧情专题",
    description: "主线、活动或特殊剧情入口",
    icon: BookOpenIcon,
  },
  {
    value: "other",
    label: "其他",
    description: "不属于以上类型的内容",
    icon: CircleEllipsisIcon,
  },
] as const satisfies ReadonlyArray<{
  value: WikiEntryKind
  label: string
  description: string
  icon: typeof UserRoundIcon
}>

export const wikiStoryEntrySubtypeOptions = [
  { value: "main", label: "主线" },
  { value: "event", label: "活动" },
  { value: "special", label: "特殊" },
  { value: "other", label: "其他" },
] as const satisfies ReadonlyArray<{
  value: WikiStoryEntrySubtype
  label: string
}>

export function wikiEntryKindLabel(
  kind: WikiEntryKind,
  subtype: WikiStoryEntrySubtype | null
) {
  if (kind === "story") {
    return (
      wikiStoryEntrySubtypeOptions.find((option) => option.value === subtype)
        ?.label ?? "剧情"
    )
  }
  return (
    wikiEntryKindOptions.find((option) => option.value === kind)?.label ??
    "其他"
  )
}

export function WikiEntryKindBadge({
  kind,
  subtype,
  variant = "outline",
}: {
  kind: WikiEntryKind
  subtype: WikiStoryEntrySubtype | null
  variant?: "default" | "secondary" | "destructive" | "outline"
}) {
  const option =
    wikiEntryKindOptions.find((candidate) => candidate.value === kind) ??
    wikiEntryKindOptions[3]
  const Icon = option.icon

  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {wikiEntryKindLabel(kind, subtype)}
    </Badge>
  )
}
