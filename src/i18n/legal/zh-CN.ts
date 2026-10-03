import { LEGAL_UPDATED, type LegalTexts } from "./types";

export const zhCN: LegalTexts = {
  updated: LEGAL_UPDATED,
  updatedLabel: "最后更新：{date}",
  draftNotice: "草稿，待站长审阅。",
  documents: {
    license: {
      title: "许可",
      sections: [
        { title: "网站代码", paragraphs: ["本站源代码以 GNU Affero 通用公共许可证第 3 版（AGPL-3.0）开源，全文见代码仓库根目录的 LICENSE 文件：{repo}。如果你通过网络向他人提供修改后的版本，AGPL 要求你同时向他们提供相应的源代码。"] },
        { title: "游戏内容", paragraphs: ["本站展示的游戏美术、音频、文本及其他游戏数据的著作权归 Bushiroad / Craft Egg / Ishimori 及其他权利人所有，仅供资料查阅与欣赏，不在本站许可范围内。本站为兼容而自制的素材以 CC BY-NC 4.0 许可发布。"] },
        {
          title: "第三方组件",
          paragraphs: ["本站使用了以下组件，各自适用其许可："],
          items: [
            "Astro 及 @astrojs/react、@astrojs/check：MIT 许可证",
            "React 与 React DOM：MIT 许可证",
            "Tailwind CSS 及 @tailwindcss/vite：MIT 许可证",
            "framer-motion（Motion）：MIT 许可证",
            "TypeScript：Apache License 2.0",
            "ournotes-player（剧情播放器与 Live2D 查看器）：许可见该软件包",
            "Live2D Cubism Core for Web：Live2D 专有软件许可，从 Live2D 服务器（或其副本）加载，不属于本站代码",
            "Live2D Cubism MotionSync Core（CRI）：Live2D 专有软件许可协议中的可再分发代码，原样提供",
            "3D 谱面预览的渲染器内含 Skia、rust-skia、zlib、libz-sys、Emscripten 及解析库，许可文本随附（src/vendor/moenotes-chart-renderer/licenses）",
          ],
        },
      ],
    },
    terms: {
      title: "使用条款",
      sections: [
        { title: "非官方粉丝站", paragraphs: ["本站是 BanG Dream! Our Notes 的非官方、非商业粉丝资料站，与 Bushiroad、Craft Egg 及游戏的其他权利人无关，也未获其认可。"] },
        { title: "内容按现状提供", paragraphs: ["数据读取自游戏公开的数据，可能不完整、过时或有误，部分翻译可能由机器生成。所有内容均按现状提供，不作任何保证。请以游戏内为准。"] },
        { title: "合理使用", items: ["不得对本站、其接口或文件服务器造成过大负载（例如高强度爬取或自动批量下载）。", "不得尝试入侵、干扰或绕过本站及其服务的保护措施。", "不得以侵犯游戏权利人权利的方式使用本站内容。"] },
        { title: "StarMoe 账号", paragraphs: ["登录使用 StarMoe 各站共用的 StarMoe 通行证。你需对自己的账号及绑定的游戏账号负责。用于滥用的账号可能被停用；设为公开的主页任何人都能看到。"] },
        { title: "变更", paragraphs: ["本条款可能会修改，页面顶部的日期为最后修改日期。继续使用本站即表示接受当前版本。"] },
      ],
    },
    privacy: {
      title: "隐私",
      sections: [
        {
          title: "保存在浏览器中的内容",
          paragraphs: ["本站会在浏览器本地存储中保存以下内容。除非另有说明，它们不会离开你的设备；清除本站数据即可删除："],
          items: [
            "设置：语言、主题模式、主题色、界面密度、游戏区服，以及是否显示日文曲名。",
            "界面状态：侧边栏与筛选抽屉的开合、列表视图与排序、滚动位置、已关闭的提示、首页布局，以及迷你播放栏的队列和进度。",
            "下载的文件：为加快加载和离线使用而缓存的游戏数据、图片、音频、Live2D 模型与谱面（可在设置的「数据」页查看和清除）。",
          ],
        },
        { title: "统计分析", paragraphs: ["本站使用 Google Analytics 统计访问量和页面使用情况。Google 会收到你的 IP 地址、浏览器信息和访问的页面，并设置其自身的 Cookie。屏蔽这些脚本不影响本站使用。"] },
        { title: "登录后", paragraphs: ["登录通过 StarMoe 通行证完成。之后本站会保存会话 Cookie，并读取你的名称、用户名和头像。如果你绑定游戏账号，会保存你填写的区服和玩家 ID，以及为其读取的游戏主页（名称、等级、收藏数和卡牌）；主页是否公开由你决定。"] },
        { title: "第三方请求", paragraphs: ["页面会从 Google Fonts 加载字体，从本站的资源服务器加载游戏文件；Live2D 查看器会加载 Live2D 的 Cubism Core。与任何网页请求一样，这些服务器能看到你的 IP 地址。"] },
        { title: "联系", paragraphs: ["对数据有疑问，请写信至页脚中的联系地址。"] },
      ],
    },
  },
};
