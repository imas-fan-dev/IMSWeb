export const defaultNamespace = "common"
export const defaultLanguage = "zh-CN"

export const resources = {
  "zh-CN": {
    common: {
      accessibility: {
        skipToContent: "跳到主要内容",
      },
      brand: {
        name: "偶像大师交流站",
        homeLabel: "IMSWeb 首页",
      },
      actions: {
        close: "关闭",
      },
      navigation: {
        mainLabel: "主导航",
        mobileLabel: "移动端主导航",
        title: "站点导航",
        description: "IMSWeb 公共页面与资料入口",
        home: "首页",
        events: "活动",
        recommendations: "推荐",
        live: "Live",
        community: "社区",
        cards: "名片墙",
        producerMap: "地图",
        works: "作品",
        chronicle: "编年史",
        about: "关于",
        runningGame: "板板大暴走",
        open: "打开导航",
      },
      footer: {
        navigationLabel: "页脚导航",
        maintainedBy: "由中文制作人社区共同维护",
        about: "关于本站",
        admin: "管理入口",
      },
      language: {
        switchTo: "切换至{{language}}",
        names: {
          "zh-CN": "简体中文",
          en: "English",
        },
      },
      theme: {
        toggle: "切换亮色或暗色模式",
      },
      errors: {
        pageProblem: "页面出现问题",
        unexpected: "发生了未预期的错误，请稍后重试。",
        notFound: "页面不存在",
        requestFailed: "请求失败",
        notFoundDetails: "没有找到对应页面，入口可能已经调整。",
        backHome: "返回首页",
      },
    },
  },
  en: {
    common: {
      accessibility: {
        skipToContent: "Skip to main content",
      },
      brand: {
        name: "The Idolmaster Community",
        homeLabel: "IMSWeb home",
      },
      actions: {
        close: "Close",
      },
      navigation: {
        mainLabel: "Main navigation",
        mobileLabel: "Mobile navigation",
        title: "Site navigation",
        description: "IMSWeb public pages and knowledge base",
        home: "Home",
        events: "Events",
        recommendations: "Features",
        live: "Live",
        community: "Community",
        cards: "Namecards",
        producerMap: "Map",
        works: "Works",
        chronicle: "Chronicle",
        about: "About",
        runningGame: "Running Idol",
        open: "Open navigation",
      },
      footer: {
        navigationLabel: "Footer navigation",
        maintainedBy: "Maintained by the Chinese Producer community",
        about: "About IMSWeb",
        admin: "Admin",
      },
      language: {
        switchTo: "Switch to {{language}}",
        names: {
          "zh-CN": "简体中文",
          en: "English",
        },
      },
      theme: {
        toggle: "Toggle light or dark mode",
      },
      errors: {
        pageProblem: "Something went wrong",
        unexpected: "An unexpected error occurred. Please try again later.",
        notFound: "Page not found",
        requestFailed: "Request failed",
        notFoundDetails:
          "This page could not be found. Its URL may have changed.",
        backHome: "Back to home",
      },
    },
  },
} as const

export type SupportedLanguage = keyof typeof resources

export const supportedLanguages = Object.keys(resources) as SupportedLanguage[]
