# MoeNotes (Our Notes Viewer)

MoeNotes 是由 [StarMoe](https://github.com/moe-sekai) 团队为 *BanG Dream!* 全新企划 *Our Notes* 开发的静态数据与资料卡片查看器。项目整体设计灵感来自“温暖、清晰、轻手作感的资料手帐”。

---

## 🛠️ 技术栈 (Technology Stack)

项目基于现代化的前端基础设施构建：
- **Astro** `v7.0.7` — 零 JS 默认开销的高性能静态站点生成器
- **React** `v19.2.3` — 用于部分高动态卡片交互组件
- **Tailwind CSS** `v4.1.18` — 新一代极速 CSS 样式库
- **TypeScript** — 严格的静态类型系统
- **Bun** — 作为包管理器和基础开发工具链

---

## 🚀 快速开始 (Getting Started)

在开始本地开发前，请确保已安装 [Bun](https://bun.sh/)。

### 1. 安装依赖
```bash
bun install
```

### 2. 启动本地开发服务
```bash
bun run dev
```

### 3. 清理缓存并强制启动开发服务
如果遇到资产缓存未刷新，请执行：
```bash
bun run dev:fresh
```

### 4. 生产打包构建
```bash
bun run build
```

### 5. 本地预览打包产物
```bash
bun run preview
```

---

## 🔍 代码规范与检查 (Coding Standards & Linting)

本项目内置了极为严格的代码检查系统，以确保多语言、路由安全和视觉风格的统一。在提交代码前请务必运行：
```bash
bun run lint
```

该命令会自动并行运行以下专项检测：
- **多语言 key 对齐 (`lint:i18n`)**：检验 `zh-CN.ts`、`en-US.ts` 与 `ja-JP.ts` 翻译文件的 key 是否完全 1:1 对齐。
- **国际化路由校验 (`lint:i18n-routing`)**：验证多语言路由规则一致性。
- **路由表完整性 (`lint:routes`)**：扫描路由定义中的重复、格式以及 i18n label配置。
- **架构合规审计 (`lint:arch`)**：
  - 禁止在非指定入口文件直接使用 `fetch()`，必须通过 domain client 模块封装。
  - 禁止直接使用原生的 `localStorage` / `sessionStorage`，必须使用封装的 `safe-storage`。
  - 禁止在配置文件以外硬编码不包含在域名白名单（如 GitHub 等）中的外部 URL（以满足静态资源安全策略）。
- **硬编码文本检查 (`lint:text`)**：禁止在 `.astro`、`.tsx`、`.ts` 等 UI 文件中硬编码中/日文字符（CJK 字符）。所有 UI 文字应全部提取至 i18n message 字典中。如需在特例中放行，需在对应行加上 `// i18n-allow-hardcoded` 或 `{/* i18n-allow-hardcoded */}`。
- **表情符号禁用 (`lint:emoji`)**：检查是否有硬编码 emoji 作为图标，确保图标均使用轻量线性 SVG。

---

## 🎨 视觉与设计规范 (Design System)

所有的组件和新开发页面必须遵循 [VISUAL_DESIGN.md](file:///d:/Python_Project/moenotes/VISUAL_DESIGN.md) 设计准则：
- **纸张手帐感**：页面主背景采用 `--mn-bg` 暖白低对比点阵，卡片容器使用 `--mn-paper` 奶油纸面。
- **圆角规范**：卡片和浮层使用 `rounded-3xl`，卡片内分区使用 `rounded-2xl`，小型按钮/输入框使用 `rounded-full`。
- **描边与阴影**：通过 `1.5px solid var(--mn-border)` 墨黑边界保持清晰手绘轮廓；按钮交互采用 Stamp 按压动效（配有 `--mn-shadow-stamp` 按压阴影）。
- **装饰元素**：可采用 `.mn-halftone`、`.mn-hand-underline`、`.mn-tape`（和纸胶带装饰）等手作风格装饰。
- 可以在浏览器中访问 `/tools/design-system` 或 `/en/design-system` 在线查看完整的设计系统参考。

---

## 📄 开源许可与版权说明 (License & Credits)

- **项目前端代码**：采用 [AGPL v3](https://github.com/moe-sekai/moenotes/blob/main/LICENSE) 协议开源。
- **官方美术与音视频资产**：*BanG Dream! Our Notes* 官方美术图像、音视频、歌词等资产版权归属版权方 **Bushiroad / Craft Egg / Ishimori** 所有。本仓库仅用于非商业性研究和学习交流，不提供任何商业授权。
- **自制/重制兼容性资产**：由社区或 StarMoe 团队自制的兼容性静态资产，采用 **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** 知识共享署名-非商业性使用协议授权开源。
