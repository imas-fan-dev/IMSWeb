export type WorkEntry = {
  slug: string
  title: string
  eyebrow: string
  summary: string
  description: string[]
  accent: string
  links?: Array<{ label: string; href: string }>
}

export const workEntries: WorkEntry[] = [
  {
    slug: "765",
    title: "765PRO ALLSTARS",
    eyebrow: "THE IDOLM@STER",
    summary: "从街机与家用机作品出发的偶像大师原点。",
    description: [
      "765PRO ALLSTARS 是偶像大师系列最早形成的核心组合。",
      "本页用于整理作品入口与中文社区资料，不复制来源和授权尚未确认的旧站图片。",
    ],
    accent: "bg-franchise-765",
  },
  {
    slug: "cg",
    title: "CINDERELLA GIRLS",
    eyebrow: "CINDERELLA GIRLS",
    summary: "拥有丰富角色与多种内容形态的灰姑娘女孩企划。",
    description: [
      "灰姑娘女孩以数量众多、个性鲜明的偶像和持续发展的音乐、游戏与演出内容构成。",
      "更完整的角色和剧情资料请通过本站资料库浏览。",
    ],
    accent: "bg-franchise-cg",
  },
  {
    slug: "ml",
    title: "MILLION LIVE!",
    eyebrow: "MILLION LIVE",
    summary: "以 765PRO LIVE THE@TER 为舞台延展的企划。",
    description: [
      "MILLION LIVE! 将 ALLSTARS 与剧场成员连接在同一舞台体系中。",
      "本站将逐步补充社区作品与相关专题入口。",
    ],
    accent: "bg-franchise-ml",
  },
  {
    slug: "sidem",
    title: "SideM",
    eyebrow: "315 PRODUCTION",
    summary: "讲述怀抱不同经历的男性偶像走向舞台的企划。",
    description: [
      "SideM 围绕 315 Production 的偶像与组合展开。",
      "页面采用文本优先的迁移方式，等待可公开资产完成来源确认。",
    ],
    accent: "bg-franchise-sidem",
  },
  {
    slug: "sc",
    title: "SHINY COLORS",
    eyebrow: "283 PRODUCTION",
    summary: "聚焦组合关系、细腻叙事与舞台表达的闪耀色彩企划。",
    description: [
      "SHINY COLORS 围绕 283 Production 的偶像组合展开。",
      "剧情阅读入口继续由 Hono Wiki 提供，前端页面只承担企划导航与社区内容聚合。",
    ],
    accent: "bg-franchise-sc",
  },
  {
    slug: "gakuen",
    title: "学园偶像大师",
    eyebrow: "HATSUBOSHI GAKUEN",
    summary: "以初星学园为舞台展开的偶像培养企划。",
    description: [
      "学园偶像大师从校园与制作科的视角展开角色成长。",
      "本页将作为后续中文资料与社区专题的稳定入口。",
    ],
    accent: "bg-franchise-gk",
  },
  {
    slug: "games",
    title: "社区游戏与工具",
    eyebrow: "FAN CREATIONS",
    summary: "汇总由制作人创作或维护的游戏、工具与互动项目。",
    description: [
      "旧站的同人游戏卡片统一迁入作品中心，外部项目仍由各自维护者负责。",
      "Unity WebGL 项目继续使用原有静态路径，不进入 React 构建产物。",
    ],
    accent: "bg-info",
    links: [{ label: "打开板板大冒险", href: "/runninggame/" }],
  },
  {
    slug: "wows",
    title: "World of W@rships",
    eyebrow: "COMMUNITY PROJECT",
    summary: "旧站 World of W@rships 社群专题的兼容入口。",
    description: [
      "该专题在新架构中归入作品中心，不再维持独立的旧式页面框架。",
      "历史图片和社群信息需要完成有效性与授权复核后再逐项恢复展示。",
    ],
    accent: "bg-warning",
  },
]

export function getWorkEntry(slug: string) {
  return workEntries.find((entry) => entry.slug === slug)
}
