import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  ContactRoundIcon,
  ExternalLinkIcon,
  Gamepad2Icon,
  HistoryIcon,
  IdCardIcon,
  InfoIcon,
  LibraryBigIcon,
  MapPinnedIcon,
  RadioTowerIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { HomepageLinkAccent, HomepageLinkIcon } from "~/lib/api"

export const homepageLinkIcons: Record<HomepageLinkIcon, LucideIcon> = {
  calendar: CalendarDaysIcon,
  "book-open": BookOpenTextIcon,
  "radio-tower": RadioTowerIcon,
  contact: ContactRoundIcon,
  library: LibraryBigIcon,
  "id-card": IdCardIcon,
  map: MapPinnedIcon,
  gamepad: Gamepad2Icon,
  history: HistoryIcon,
  info: InfoIcon,
  "external-link": ExternalLinkIcon,
}

export const homepageLinkIconLabels: Record<HomepageLinkIcon, string> = {
  calendar: "日历",
  "book-open": "书籍",
  "radio-tower": "直播",
  contact: "社区",
  library: "资料库",
  "id-card": "名片",
  map: "地图",
  gamepad: "工具",
  history: "历史",
  info: "信息",
  "external-link": "外部链接",
}

export const homepageLinkAccentClasses: Record<HomepageLinkAccent, string> = {
  "franchise-765": "bg-franchise-765",
  "franchise-cg": "bg-franchise-cg",
  "franchise-ml": "bg-franchise-ml",
  "franchise-sidem": "bg-franchise-sidem",
  "franchise-sc": "bg-franchise-sc",
  "franchise-gk": "bg-franchise-gk",
  primary: "bg-primary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
}

export const homepageLinkAccentLabels: Record<HomepageLinkAccent, string> = {
  "franchise-765": "765PRO",
  "franchise-cg": "灰姑娘女孩",
  "franchise-ml": "百万现场",
  "franchise-sidem": "SideM",
  "franchise-sc": "闪耀色彩",
  "franchise-gk": "学园偶像大师",
  primary: "站点主色",
  info: "信息",
  success: "成功",
  warning: "提示",
}
