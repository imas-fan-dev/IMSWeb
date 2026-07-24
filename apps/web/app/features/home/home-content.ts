import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  ContactRoundIcon,
  Gamepad2Icon,
  MapPinnedIcon,
  RadioTowerIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type SeriesItem = {
  name: string
  background: string
}

export type PortalItem = {
  title: string
  description: string
  href: string
  icon: LucideIcon
  accent: string
}

export type FriendLink = {
  title: string
  description: string
  href: string
  accent: string
}

export const seriesItems: SeriesItem[] = [
  {
    name: "765PRO ALLSTARS",
    background: "bg-[#f34e6c]",
  },
  {
    name: "CINDERELLA GIRLS",
    background: "bg-[#2581c7]",
  },
  {
    name: "MILLION LIVE!",
    background: "bg-[#ffc20b]",
  },
  {
    name: "SideM",
    background: "bg-[#11be93]",
  },
  {
    name: "SHINY COLORS",
    background: "bg-[#8dbaff]",
  },
  {
    name: "学园偶像大师",
    background: "bg-[#f39800]",
  },
]

export const portalItems: PortalItem[] = [
  {
    title: "活动中心",
    description: "浏览近期活动与公开信息",
    href: "/events",
    icon: CalendarDaysIcon,
    accent: "bg-franchise-765",
  },
  {
    title: "内容推荐",
    description: "发现社区作品与精选内容",
    href: "/recommendations",
    icon: BookOpenTextIcon,
    accent: "bg-franchise-cg",
  },
  {
    title: "社区入口",
    description: "查找社区与协作项目",
    href: "/community",
    icon: ContactRoundIcon,
    accent: "bg-franchise-ml",
  },
  {
    title: "作品与工具",
    description: "浏览社区创作与实用工具",
    href: "/works",
    icon: Gamepad2Icon,
    accent: "bg-franchise-sidem",
  },
  {
    title: "直播日程",
    description: "查看演出与直播信息",
    href: "/live",
    icon: RadioTowerIcon,
    accent: "bg-franchise-sc",
  },
  {
    title: "关于 IMSWeb",
    description: "了解项目定位与维护方式",
    href: "/about",
    icon: MapPinnedIcon,
    accent: "bg-franchise-gk",
  },
]

export const friendLinks: FriendLink[] = [
  {
    title: "偶像大师 SP 汉化",
    description: "SP 中文化项目",
    href: "https://sp.idolmaster.top/",
    accent: "bg-franchise-765",
  },
  {
    title: "偶像大师 OFA 汉化",
    description: "ONE FOR ALL 中文化项目",
    href: "https://ofa.idolmaster.top/",
    accent: "bg-franchise-cg",
  },
  {
    title: "偶像大师 2 汉化",
    description: "偶像大师 2 中文化项目",
    href: "https://2nd.idolmaster.top/",
    accent: "bg-franchise-ml",
  },
  {
    title: "闪耀色彩 SpineViewer",
    description: "闪耀色彩 Spine 动画查看工具",
    href: "https://spine.asahikari.cn/",
    accent: "bg-franchise-sc",
  },
  {
    title: "偶像大师灰姑娘女孩 Wiki",
    description: "Biligame 社区资料站",
    href: "https://wiki.biligame.com/imascg/",
    accent: "bg-franchise-sidem",
  },
  {
    title: "申请添加友情链接",
    description: "通过哔哩哔哩联系站长",
    href: "https://space.bilibili.com/41356186?spm_id_from=333.1007.0.0",
    accent: "bg-franchise-gk",
  },
]

// Migrated from the legacy home page's site-support section.
export const supportLinks: FriendLink[] = [
  {
    title: "本站由雨云提供计算服务",
    description: "IMSWeb 当前站点支持",
    href: "https://app.rainyun.com/",
    accent: "bg-info",
  },
  {
    title: "雨云，新一代云服务提供商",
    description: "云计算服务入口",
    href: "https://app.rainyun.com/",
    accent: "bg-success",
  },
  {
    title: "国内自主云计算平台",
    description: "服务商官方网站",
    href: "https://app.rainyun.com/",
    accent: "bg-warning",
  },
]
