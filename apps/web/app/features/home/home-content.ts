import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  ContactRoundIcon,
  Gamepad2Icon,
  HistoryIcon,
  MapPinnedIcon,
  RadioTowerIcon,
  ShipWheelIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type SeriesItem = {
  name: string
  image: string
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
    image: "/assets/images/Production/765intro.png",
    background: "bg-[#f34e6c]",
  },
  {
    name: "CINDERELLA GIRLS",
    image: "/assets/images/Production/Cinderellaintro.png",
    background: "bg-[#2581c7]",
  },
  {
    name: "MILLION LIVE!",
    image: "/assets/images/Production/Millionintro.png",
    background: "bg-[#ffc20b]",
  },
  {
    name: "SideM",
    image: "/assets/images/Production/Sidemintro.png",
    background: "bg-[#11be93]",
  },
  {
    name: "SHINY COLORS",
    image: "/assets/images/Production/Shinyintro.png",
    background: "bg-[#8dbaff]",
  },
  {
    name: "学园偶像大师",
    image: "/assets/images/Production/Gakuenintro.png",
    background: "bg-[#f39800]",
  },
]

// Keep legacy destinations until their new React routes provide equivalent UX.
export const portalItems: PortalItem[] = [
  {
    title: "全国制作人社群",
    description: "按地区查找社群与联系方式",
    href: "/producermap.html",
    icon: MapPinnedIcon,
    accent: "bg-franchise-765",
  },
  {
    title: "制作人名片墙",
    description: "浏览与发布制作人名片",
    href: "/ProducerNameCard.html",
    icon: ContactRoundIcon,
    accent: "bg-franchise-cg",
  },
  {
    title: "W@RSHIPS",
    description: "战舰世界主题内容与社区资料",
    href: "/WOWSIntroduction.html",
    icon: ShipWheelIcon,
    accent: "bg-franchise-ml",
  },
  {
    title: "同人游戏与 MOD",
    description: "社区游戏、工具与模组",
    href: "/game.html",
    icon: Gamepad2Icon,
    accent: "bg-franchise-sidem",
  },
  {
    title: "线上与线下活动",
    description: "国内活动发布与报名信息",
    href: "/Event.html",
    icon: CalendarDaysIcon,
    accent: "bg-franchise-sc",
  },
  {
    title: "剧情整理大全",
    description: "角色、剧集与剧情条目",
    href: "/wiki/",
    icon: BookOpenTextIcon,
    accent: "bg-franchise-gk",
  },
  {
    title: "板板大冒险",
    description: "社区制作的网页游戏",
    href: "/runninggame/index.html",
    icon: Gamepad2Icon,
    accent: "bg-franchise-765",
  },
  {
    title: "同人活动编年史",
    description: "历年国内同人活动记录",
    href: "/timeline.html",
    icon: HistoryIcon,
    accent: "bg-franchise-cg",
  },
  {
    title: "Live 和活动一览",
    description: "演出与公开活动日程",
    href: "/live.html",
    icon: RadioTowerIcon,
    accent: "bg-franchise-ml",
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
