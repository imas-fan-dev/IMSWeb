import { WORK_CHARACTER_IMAGE_URLS } from "~/pages/works/brand-assets"

export type WorkEntry = {
  slug: string
  title: string
  eyebrow: string
  /** CSS gradient string for the franchise title (e.g. "90deg, #ff6fa5, #ffb199") */
  gradient: string
  /** Light tint background for the 企划概要 text block */
  introBg: string
  /** Japanese franchise name */
  japaneseName: string
  /** Short tagline phrases displayed as franchise signature quotes */
  tagline: string[]
  /** Franchise start year */
  since: number
  summary: string
  /** 企划概要 — the original franchise overview paragraph from the legacy site */
  description: string[]
  accent: string
  /** Wiki agency name used by the public project page. */
  wikiAgencyName?: string
  /** Franchise intro banner — displayed as hero image in the detail page header */
  heroImage?: string
  /** Character standing illustration (立绘) — displayed alongside the description */
  characterImage?: string
  links?: Array<{ label: string; href: string }>
  navLinks?: Array<{ label: string; href: string }>
  /** 作品分类：官方企划 或 同人/社区作品 */
  category: "official" | "fan"
}

export const officialEntries: WorkEntry[] = [
  {
    slug: "765",
    title: "765PRO ALLSTARS",
    eyebrow: "THE IDOLM@STER",
    gradient: "90deg, #ff6fa5, #ffb199",
    introBg: "#FFF1F4",
    japaneseName: "アイドルマスター 偶像大师",
    tagline: [
      "「偶像大师」系列的原点。",
      "作为765事务所制作人的你，",
      "将与偶像们携手并肩，向着顶尖偶像的目标，",
      "奋力前行。",
    ],
    since: 2005,
    summary: "从街机与家用机作品出发的偶像大师原点。",
    heroImage: "/brand/series/wall/765pro.webp",
    characterImage: WORK_CHARACTER_IMAGE_URLS["765"],
    description: [
      "《偶像大师》是一款起源于娱乐设施用街机的偶像养成类游戏。起源于2005年。",
      "玩家在游戏中以制作人的身份培育偶像的系统、个性丰富的角色以及多彩的乐曲，获得了广大玩家和粉丝的支持。",
      "迄今为止，「偶像大师」系列已在包括主机游戏、电视动画、广播、移动端内容以及演唱会等多种渠道实现了跨媒体展开。",
    ],
    accent: "bg-franchise-765",
    wikiAgencyName: "765PRO",
    category: "official",
  },
  {
    slug: "cg",
    title: "CINDERELLA GIRLS",
    eyebrow: "CINDERELLA GIRLS",
    gradient: "90deg, #006FF9, #5AC3FE",
    introBg: "#EBF7FF",
    japaneseName: "ァナドルマスタ一 シソデレラガ一ルズ 偶像大师灰姑娘女孩",
    tagline: [
      "可培育的偶像全系列中最多，超过190人！",
      "让这些性格丰富、以成为顶尖偶像为目标的偶像们，",
      "通过你的努力闪耀光芒吧！",
      "「此刻，魔法即将奏效——」",
    ],
    since: 2011,
    summary: "拥有丰富角色与多种内容形态的灰姑娘女孩企划。",
    heroImage: "/brand/series/wall/cinderella-girls.webp",
    characterImage: WORK_CHARACTER_IMAGE_URLS.cg,
    description: [
      "《偶像大师灰姑娘女孩》起始于2011年开始提供服务的社交游戏。",
      "登场偶像超过190人，2015年1月播出电视动画，同年9月推出了节奏游戏《偶像大师灰姑娘女孩星光舞台》。",
      "通过演出、训练、各式各样的工作与交流，让超过190名性格丰富的偶像闪耀光芒，朝着顶尖偶像的目标成长吧！",
    ],
    accent: "bg-franchise-cg",
    wikiAgencyName: "灰姑娘女孩",
    category: "official",
  },
  {
    slug: "ml",
    title: "MILLION LIVE!",
    eyebrow: "MILLION LIVE",
    gradient: "90deg, #FFAF2E, #FFDA60",
    introBg: "#FFFBEC",
    japaneseName: "アイドルマスタ一 ミリオンライブ！ 偶像大师 百万现场！",
    tagline: [
      "「经过欢笑与烦恼，女孩们将会更加闪耀——",
      "请与我们一起，在这座剧场中实现梦想！」",
      "通过和偶像们共同打造的演唱会现场",
      "一同寻找“百万的闪耀”吧！",
    ],
    since: 2013,
    summary: "以 765PRO LIVE THE@TER 为舞台延展的企划。",
    heroImage: "/brand/series/wall/million-live.webp",
    characterImage: WORK_CHARACTER_IMAGE_URLS.ml,
    description: [
      "《偶像大师百万现场！》于2013年作为「偶像大师」系列的社交游戏诞生，2017年6月推出了手机APP游戏《偶像大师百万现场！剧场时光》。",
      '在该游戏中，玩家将以"765PRO LIVE THEATER"为舞台，培育"765 MILLION ALLSTARS"的52名偶像。',
      "通过演出、工作与交流与偶像们互动，培育她们，引导她们成长为顶尖偶像吧！",
    ],
    accent: "bg-franchise-ml",
    wikiAgencyName: "百万现场",
    category: "official",
  },
  {
    slug: "sidem",
    title: "SideM",
    eyebrow: "315 PRODUCTION",
    gradient: "90deg, #05CC9A, #68E081",
    introBg: "#F2FFF4",
    japaneseName: "アイドルマスタ一 サイドエム 偶像大师 SideM",
    tagline: [
      "医生！自由职业者！自卫官！",
      "因为各种各样的原因成为偶像！",
      "成为315事务所的制作人，",
      "来培育因为各种各样的理由而成为偶像的他们吧。",
    ],
    since: 2014,
    summary: "讲述怀抱不同经历的男性偶像走向舞台的企划。",
    heroImage: "/brand/series/wall/sidem.webp",
    characterImage: WORK_CHARACTER_IMAGE_URLS.sidem,
    description: [
      "「偶像大师」系列首款男性偶像培育游戏，诞生于2014年。2017年8月推出手机游戏《偶像大师SideM LIVE ON ST@GE!》，2021年10月则推出手机游戏《偶像大师SideM GROWING STARS》。",
      "目前事务所已迁移至偶像大师官方网站的SideM企划页面，偶像们的故事仍在继续的同时，还会在演唱会、音乐、周边等领域广泛展开！",
      "玩家成为制作人后，将会培育性格丰富的男性偶像，诸如医生、自由职业者和自卫官等社会人，或是学生。通过营业、训练、演出等工作来培育偶像，以顶尖偶像为目标迈进。",
    ],
    accent: "bg-franchise-sidem",
    wikiAgencyName: "SideM",
    category: "official",
  },
  {
    slug: "sc",
    title: "SHINY COLORS",
    eyebrow: "283 PRODUCTION",
    gradient: "90deg, #4791FF, #D4E5F8",
    introBg: "#E6ECFF",
    japaneseName: "アイドルマスタ一 シャイニ一カラ一ズ 偶像大师闪耀色彩",
    tagline: [
      "283事务所旗下的8个组合。",
      "偶像们以各自的色彩闪耀着充满个性的光芒。",
      "她们奋力振翅翱翔的身姿，",
      "将由作为制作人的你，从此一路守护。",
    ],
    since: 2018,
    summary: "聚焦组合关系、细腻叙事与舞台表达的闪耀色彩企划。",
    heroImage: "/brand/series/wall/shiny-colors.webp",
    characterImage: WORK_CHARACTER_IMAGE_URLS.sc,
    description: [
      "《偶像大师闪耀色彩》自2018年起作为「偶像大师」系列的一员面世。企划从游戏起步，广泛延伸至演唱会、周边、CD和广播等众多领域。",
      "手机APP游戏《偶像大师闪耀色彩Song For Prism》也正火热运营中。企划于2024年4月播出动画第一季，2024年10月顺利播出动画第二季。",
      "今后也请继续支持这些展翅翱翔的偶像们！",
    ],
    accent: "bg-franchise-sc",
    wikiAgencyName: "闪耀色彩",
    category: "official",
  },
  {
    slug: "gakuen",
    title: "学园偶像大师",
    eyebrow: "HATSUBOSHI GAKUEN",
    gradient: "90deg, #FE8C03, #FFAC30",
    introBg: "#FEF7EA",
    japaneseName: "学園アイドルマスタ一 学园偶像大师",
    tagline: [
      '舞台座落于偶像育成学校"初星学园"。',
      '培育兼备各种问题与多彩魅力的"偶像之卵"！',
      "引领她们向着学园第一偶像的目标，",
      "以及顶尖偶像的目标，迈进吧！",
    ],
    since: 2024,
    summary: "以初星学园为舞台展开的偶像培养企划。",
    heroImage: "/brand/series/wall/gakuen.webp",
    characterImage: WORK_CHARACTER_IMAGE_URLS.gakuen,
    description: [
      '于2024年诞生的「偶像大师」系列最新作。玩家将作为制作人，入学偶像育成学校"初星学园"，对兼备各种问题与多彩魅力的"偶像之卵"们进行培育。',
      "该企划以2024年春季上线的手机APP游戏为起点，在CD、周边、演唱会等多方面广泛展开！",
      "在全新的舞台上与偶像们所共同描绘的学园生活，请尽情享受！",
    ],
    accent: "bg-franchise-gk",
    wikiAgencyName: "学园偶像大师",
    category: "official",
  },
]

// TODO: 同人作品与官方作品后续需重新设计业务逻辑（审核流程、展示优先级等）
export const fanEntries: WorkEntry[] = [
  {
    slug: "games",
    title: "社区游戏与工具",
    eyebrow: "FAN CREATIONS",
    gradient: "",
    introBg: "",
    japaneseName: "",
    tagline: [],
    since: 0,
    summary: "汇总由制作人创作或维护的游戏、工具与互动项目。",
    description: [
      "制作人社区在官方内容之外创作了大量同人游戏、工具与互动项目，从网页小游戏到 Unity WebGL 完整作品，展示了社区的创造力与热情。",
      "旧站的同人游戏卡片统一迁入作品中心，外部项目仍由各自维护者负责。",
      "如果你有作品想加入本页，欢迎联系管理团队。",
    ],
    accent: "bg-info",
    category: "fan",
    links: [{ label: "打开板板大冒险", href: "/runninggame/" }],
    navLinks: [{ label: "📰 资料库", href: "/wiki" }],
  },
  {
    slug: "wows",
    title: "World of W@rships",
    eyebrow: "COMMUNITY PROJECT",
    gradient: "",
    introBg: "",
    japaneseName: "",
    tagline: [],
    since: 0,
    summary: "旧站 World of W@rships 社群专题的兼容入口。",
    description: [
      "该专题由社区玩家维护，聚合了偶像大师与 World of Warships 联动相关的资讯、涂装指南与社群讨论。",
      "在新架构中归入作品中心，不再维持独立的旧式页面框架。",
      "历史图片和社群信息需要完成有效性与授权复核后再逐项恢复展示。",
    ],
    accent: "bg-warning",
    category: "fan",
    navLinks: [{ label: "📰 资料库", href: "/wiki" }],
  },
]

export const workEntries = [...officialEntries, ...fanEntries]

export function getWorkEntry(slug: string) {
  return workEntries.find((entry) => entry.slug === slug)
}

export function getWorkDestination(entry: WorkEntry) {
  if (!entry.wikiAgencyName) return `/works/${entry.slug}`

  return `/wiki?agency=${encodeURIComponent(entry.wikiAgencyName)}`
}
