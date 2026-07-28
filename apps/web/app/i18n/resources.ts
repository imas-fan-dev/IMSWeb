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
      upload: {
        dropZoneLabel: "{{fileKind}}文件选择",
        dropTitle: "松开以选择{{fileKind}}",
        uploadingTitle: "正在上传{{fileKind}}",
        uploadingDetail: "上传完成前请勿关闭页面",
        uploadingStatus: "上传中",
        selectedDetail: "{{fileKind}} · {{size}}",
        unavailableStatus: "不可用",
        selectedStatus: "已选择",
        changeFile: "更换",
        selectFile: "选择文件",
        removeFile: "移除 {{fileName}}",
        removeSelectedFile: "移除已选择的文件",
        image: {
          label: "上传图片",
          emptyTitle: "选择一张图片",
          emptyDetail: "PNG、JPEG、WebP 或 AVIF",
          emptyDetailWithGif: "PNG、JPEG、WebP、AVIF 或 GIF",
          conversionDetail:
            "支持 PNG、JPEG、WebP、AVIF 或 GIF，保存时统一转换为 WebP。",
          fileKind: "图片",
        },
        eventImage: {
          emptyTitle: "选择活动图片",
          emptyDetail: "图片文件 · 不超过 3 MiB",
          fileKind: "活动图片",
        },
        storyCover: {
          emptyTitle: "选择共享封面",
          emptyDetail: "JPEG、PNG、WebP 或 GIF",
          fileKind: "封面图片",
        },
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
      upload: {
        dropZoneLabel: "{{fileKind}} file picker",
        dropTitle: "Drop to select {{fileKind}}",
        uploadingTitle: "Uploading {{fileKind}}",
        uploadingDetail: "Keep this page open until the upload is complete",
        uploadingStatus: "Uploading",
        selectedDetail: "{{fileKind}} · {{size}}",
        unavailableStatus: "Unavailable",
        selectedStatus: "Selected",
        changeFile: "Change",
        selectFile: "Choose file",
        removeFile: "Remove {{fileName}}",
        removeSelectedFile: "Remove selected file",
        image: {
          label: "Upload image",
          emptyTitle: "Choose an image",
          emptyDetail: "PNG, JPEG, WebP, or AVIF",
          emptyDetailWithGif: "PNG, JPEG, WebP, AVIF, or GIF",
          conversionDetail:
            "PNG, JPEG, WebP, AVIF, or GIF. Images are converted to WebP when saved.",
          fileKind: "Image",
        },
        eventImage: {
          emptyTitle: "Choose an event image",
          emptyDetail: "Image file · Up to 3 MiB",
          fileKind: "Event image",
        },
        storyCover: {
          emptyTitle: "Choose a shared cover",
          emptyDetail: "JPEG, PNG, WebP, or GIF",
          fileKind: "Cover image",
        },
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
