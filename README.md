# MoeNotes

[English](./README.en.md) | 简体中文

MoeNotes 是由 [StarMoe](https://github.com/StarMoe-org) 团队为 BanG Dream! 企划 *Our Notes* 开发的游戏资料数据库与综合工具站。

项目采用 **Next.js 16 + Go 半 SSR（Semi-SSR）** 架构构建，兼顾新活动/卡面上线时的秒级时效性与静态级响应速度，提供角色、卡面、活动、招募、乐曲与 3D 谱面、Live2D、剧情播放器以及 Haneoka Rust WASM 自动组卡等全套功能。如果你想要了解游戏元数据或追踪版本更新动态，可以访问 [moenotes-masterdata](https://github.com/StarMoe-org/moenotes-masterdata)。

## 特性

- **全量游戏资料与工具集**：涵盖角色档案、卡面立绘与满级属性、活动与加成计算、招募概率、交换所/商店、Live2D 模型浏览、剧情播放、3D 谱面预览及智能组卡计算器。
- **半 SSR 秒级时效与多层版本缓存**：
  - Go 网关前置持久化压缩 HTML/Markdown 磁盘缓存（`singleflight` 并发归并 + 空闲后台预热）；
  - 全链路请求携带显式区服版本号（`?v=`），`current_version.json` 每次检查强制穿透 CDN 与本地缓存；
  - 页面右上角 **「设置 → 数据」** 实时展示云端最新版本、当前页面版本与 TW / JP / EN / KR 全区服 MasterData 版本号，并支持一键**强制刷新数据**（穿透缓存重绘）。
- **爬虫与 AI 友好的双模态路由（HTML + Markdown）**：
  - 全站 13 种语言路由同时支持 `Accept: text/markdown` 内容协商与 `.md` 后缀直达（如 `/cards/71.md`、`/ja/events/4.md`），返回带 YAML Frontmatter 与 `X-Markdown-Tokens` 计数的纯净 Markdown；
  - 内置 `/llms.txt`、`/llms-full.txt`、`/api/v1/meta/version` 以及语义化 SSR 实体详情 SEO 壳层。
- **多语言与多区服回退**：内置 13 种界面语言切换，支持繁中（TW）、日服（JP）、国际服（EN）、韩服（KR）MasterData 自动回退与对比。
- **Material Design 3**：基于 MUI + MD3 动态取色令牌构建，支持按乐队主题色动态生成浅色/深色配色方案（规范见 `VISUAL_DESIGN.md`）。

组卡工具内置 Haneoka Rust WASM 推荐引擎（构建说明见 [docs/haneoka-engine.md](docs/haneoka-engine.md)），同时在「我的卡池」提供「导出到 Haneoka」和 [Haneoka 组卡](https://haneoka.org/zh-CN/team-builder/)入口。导出的 JSON 可在 Haneoka 卡库的导入窗口读取并预览；绑定存档时导出当前已读取的库存，保留未知、冲突和待复核状态，不包含存档链接或观测历史。原有「导出备份」仍用于备份 MoeNotes 卡库。

## 技术栈

- **应用框架**：Next.js 16（App Router，`output: "standalone"`）
- **边缘网关与缓存服务**：Go 1.25（半 SSR 反向代理、持久化 HTML/Markdown 磁盘缓存、Next.js 进程守护与版本轮询）
- **交互组件**：React 19、MUI（Material Design 3 主题 + Emotion SSR）
- **计算引擎**：Rust / WebAssembly（Haneoka 组卡引擎、谱面渲染器）
- **样式库**：Tailwind CSS v4
- **开发语言与工具链**：TypeScript、Bun

## 快速上手

本地开发需安装 [Node.js 22+](https://nodejs.org/) 与 [Bun](https://bun.sh/)（生产网关构建另需 Go 1.25+）。

### 1. 安装依赖

```bash
bun install
```

### 2. 启动本地开发服务

```bash
bun run dev
```

如遇本地构建缓存异常，可清理 `.next` 缓存并重新启动：

```bash
bun run dev:fresh
```

开发环境默认从远程 `metadata.bdon.moe` 拉取最新 MasterData。如需指向本地克隆的 `moenotes-masterdata` 目录，可指定环境变量：

```bash
MOENOTES_MASTERDATA_DIR=../moenotes-masterdata bun run dev
```

### 3. 生产打包与本地预览

```bash
bun run build
bun run preview
```

### 4. 代码规范、类型与测试检查

```bash
bun run lint
bun run check
bun test tests/
```

## 部署说明

项目与隔壁 [Moesekai](https://github.com/StarMoe-org/Moesekai) 采用一致的容器化部署架构，支持 **Zeabur k3s 一键 `Dockerfile` 构建部署**（零必填环境变量，自动启用 Go + Next.js 半 SSR 模式并管理 `/data` 缓存目录）。完整环境变量、集群内网源配置及缓存穿透接口说明见 [docs/deployment.md](docs/deployment.md)。

## 提交与发版

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，并且使用纯英文书写（标题与正文不能含中日韩文字或全角标点），例如 `feat(events): add exchange detail page`、`fix: stop dark mode flicker`。`bun install` 会启用仓库自带的 `commit-msg` 钩子，不合规的提交信息会被拒绝；CI 也会检查 Pull Request 标题、PR 内的提交和推送到 `main` 的提交。

版本号遵循语义化版本，每个版本的更新说明见 [GitHub Releases](https://github.com/StarMoe-org/moenotes/releases)，由 [git-cliff](https://git-cliff.org/) 根据提交自动生成：

```bash
bun run release          # 按提交推算下一个版本，更新 package.json，提交并打标签
git push origin HEAD v0.2.0
```

推送 `v*` 标签后，CI 会创建对应的 GitHub Release 并生成更新说明。

## 关于架构演进的一点记录

最初选型看中了 Astro 的纯静态优先与 Islands 架构，但面对游戏资料站这样重交互、重客户端状态、又要求新卡/新活动上线后立刻可见的场景，全量静态预渲染不仅构建耗时长，实际开发维护也确实挺折腾的（笑）。如今正式参考自家 `Moesekai` 重构为 **Next.js 16 + Go 半 SSR + 爬虫友好 Markdown 路由**，开发体验和数据时效性都舒服多了。

## 开源协议与版权说明

- 本项目源码采用 [AGPL-3.0](https://github.com/StarMoe-org/moenotes/blob/main/LICENSE) 协议开源。
- 游戏官方美术立绘、音频、剧情等资产版权均归属版权方 **Bushiroad / Craft Egg / Ishimori** 所有。
- 本项目为非商业性质的粉丝向技术研究与交流项目，不提供任何商业授权。
