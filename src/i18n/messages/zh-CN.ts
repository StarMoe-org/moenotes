import type { MessageTree } from "@/i18n/translate";

export const zhCN = {
  nav: {
    home: "首页",
    groups: {
      database: "资料库",
      activity: "活动",
      story: "剧情",
      tools: "工具",
      community: "社区",
    },
    items: {
      characters: "角色",
      music: "音乐",
      events: "活动列表",
      news: "公告",
      mainStory: "主线剧情",
      eventStory: "活动剧情",
      toolbox: "工具箱",
    },
  },
  shell: {
    openSidebar: "打开侧边栏",
    closeSidebar: "关闭侧边栏",
    openSettings: "打开设置",
    openCommandPalette: "打开命令面板",
    skipToContent: "跳到正文",
    breadcrumbExpandGroup: "展开导航分组",
    breadcrumbExpandItems: "展开同组页面",
    commandPlaceholder: "搜索页面、功能或数据...",
    noCommandResults: "没有找到结果",
    shortcuts: "快捷键",
  },
  settings: {
    title: "设置",
    language: "语言",
    colorScheme: "主题模式",
    animationLevel: "动画强度",
    sidebarMode: "侧边栏",
    assetSource: "资源线路",
    masterdataSource: "MasterData 来源",
    scrollMemory: "滚动记忆",
    options: {
      system: "跟随系统",
      light: "浅色",
      dark: "深色",
      full: "完整",
      reduced: "适中",
      off: "关闭",
      auto: "自动",
      expanded: "展开",
      collapsed: "折叠",
      main: "主线路",
      backup: "备用线路",
      official: "官方/默认",
      mirror: "镜像",
    },
  },
  actions: {
    close: "关闭",
    clearCache: "清除缓存",
    refresh: "刷新",
    open: "打开",
    viewGroup: "查看分组",
  },
  home: {
    eyebrow: "MoeSekai 新企划",
    title: "Moenotes",
    subtitle: "为 BanG Dream! Our Notes 准备的新一代 viewer 前端骨架。",
    description: "从第一天开始，把 i18n、SEO、面包屑、设置、滚动记忆、资源管理和 masterdata 版本机制都放在正确的位置。",
    ctaPrimary: "浏览资料库",
    ctaSecondary: "查看架构",
    featuresTitle: "不是 demo，是长期可维护的模子",
    features: {
      i18n: "Astro 原生 i18n 路由",
      breadcrumb: "统一路由注册表驱动面包屑",
      masterdata: "版本感知 MasterData 缓存",
      settings: "类型安全的设置系统",
      scroll: "跨页面滚动记忆",
      seo: "SEO、JSON-LD、Sitemap 一体化",
    },
  },
  page: {
    groupIntro: "这个分组的页面都从统一 route registry 派生，侧边栏、面包屑、命令面板、SEO 会自动同步。",
    placeholderTitle: "页面骨架已就绪",
    placeholderDescription: "真实 Our Notes 数据确认后，可以在不重构基础设施的前提下接入业务组件。",
  },
  seo: {
    home: {
      title: "Moenotes - Our Notes Viewer",
      description: "Moenotes 是 MoeSekai 为 BanG Dream! Our Notes 构建的新一代 viewer 前端。",
    },
    database: {
      title: "资料库",
      description: "浏览 Our Notes 的角色、音乐和未来 masterdata 资料。",
    },
    characters: {
      title: "角色资料",
      description: "Our Notes 角色资料页面骨架。",
    },
    music: {
      title: "音乐资料",
      description: "Our Notes 音乐资料页面骨架。",
    },
    activity: {
      title: "活动中心",
      description: "浏览 Our Notes 活动和公告。",
    },
    events: {
      title: "活动列表",
      description: "Our Notes 活动列表页面骨架。",
    },
    news: {
      title: "公告",
      description: "Our Notes 公告页面骨架。",
    },
    story: {
      title: "剧情",
      description: "Our Notes 剧情 viewer 页面骨架。",
    },
    mainStory: {
      title: "主线剧情",
      description: "Our Notes 主线剧情页面骨架。",
    },
    eventStory: {
      title: "活动剧情",
      description: "Our Notes 活动剧情页面骨架。",
    },
    tools: {
      title: "工具",
      description: "Moenotes 工具页面骨架。",
    },
    toolbox: {
      title: "工具箱",
      description: "Moenotes 工具箱页面骨架。",
    },
    about: {
      title: "关于 Moenotes",
      description: "了解 Moenotes 与 MoeSekai。",
    },
  },
} as const satisfies MessageTree;
