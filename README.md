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

### 6. Docker 静态预览与 GHCR

镜像使用 Bun 构建 Astro 页面，再由 Caddy 服务 `dist/` 静态文件。可在本地构建并查看：

```bash
docker build -t moenotes-preview .
docker run --rm -p 8080:80 moenotes-preview
```

打开 `http://localhost:8080`。容器会按静态文件返回各语言页面、`robots.txt` 和 `sitemap.xml`，不存在的路径返回项目的 404 页面。

需要发布临时镜像时，在 GitHub Actions 中运行 **Publish preview image**，可选择要构建的分支或提交。工作流会推送 `ghcr.io/starmoe-org/moenotes:preview` 和对应的 `sha-<完整提交 SHA>` 标签。部署机器可以执行：

```bash
docker pull ghcr.io/starmoe-org/moenotes:preview
docker run -d --name moenotes-preview -p 8080:80 ghcr.io/starmoe-org/moenotes:preview
```

GHCR 只保存镜像；展示页面仍需在部署机器上运行容器，并将域名或反向代理指向容器端口。如果包设为私有，拉取前需先登录 GHCR。`preview` 标签会被下一次手动发布覆盖，`sha-...` 标签用于固定某次构建。

如果由容器直接处理域名和 HTTPS，将域名 A/AAAA 记录指向部署机器，并开放 80/443 端口，然后以实际域名替换下方的 `bdon.moe`：

```bash
docker run -d --name moenotes-preview -e SITE_ADDRESS=bdon.moe -p 80:80 -p 443:443 -v moenotes-caddy-data:/data -v moenotes-caddy-config:/config ghcr.io/starmoe-org/moenotes:preview
```

Caddy 会自动申请和续期证书。保留 `/data` 数据卷可避免容器重建后重复申请证书。默认的 `SITE_ADDRESS=:80` 仅用于本地 HTTP 预览；站点原有的 `robots.txt`、站点地图和 canonical URL 会照常发布。

---

## 🔍 代码规范与检查 (Coding Standards & Linting)

本项目内置了极为严格的代码检查系统，以确保多语言、路由安全和视觉风格的统一。在提交代码前请务必运行：
```bash
bun run lint
```

该命令会自动并行运行以下专项检测：
- **多语言 key 对齐 (`lint:i18n`)**：检验 `SUPPORTED_LOCALES` 下各翻译文件 key 是否与 `zh-CN` 完全 1:1 对齐（`zh-CN` 为 key 权威源）。
- **国际化路由校验 (`lint:i18n-routing`)**：验证多语言路由规则与 `locales.ts` / Astro 配置一致。
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

## 🌐 多语言 (i18n)

当前仓库内支持：

| Locale | 路径 | 说明 |
|--------|------|------|
| `zh-CN` | `/`（默认无前缀） | 产品默认 / key 清单权威 |
| `zh-TW` | `/zh-tw` | 繁体中文 |
| `ja-JP` | `/ja` | 核心 |
| `en-US` | `/en` | 核心，**运行时缺失文案回退语言** |
| `ko-KR` | `/ko` | 核心（masterdata korean 字段） |
| `th-TH` | `/th` | UI（masterdata en→ja→zh） |
| `id-ID` | `/id` | UI（masterdata en→ja→zh） |
| `vi-VN` | `/vi` | UI（masterdata en→ja→zh） |
| `es-ES` | `/es` | UI（masterdata en→ja→zh） |
| `pt-BR` | `/pt` | UI（masterdata en→ja→zh） |
| `fr-FR` | `/fr` | UI（masterdata en→ja→zh） |
| `de-DE` | `/de` | UI（masterdata en→ja→zh） |
| `ru-RU` | `/ru` | UI（masterdata en→ja→zh） |

运行时 `t()` 解析顺序：当前语言 → `en-US` → 空字符串。**不会**把原始 key（如 `nav.items.foo`）暴露到 UI。

### Agent / 功能改动时的 i18n 边界（重要）

一般文件改动或功能增加时：

1. **先完成功能本身**（逻辑、UI、路由、中/英/日核心文案）。
2. **正常完成后，先停下来等用户确认 / 明确要求**，再处理非中英日的 i18n。
3. **除非用户明确要求**，否则 **不要擅自修改** 非 `zh-CN` / `ja-JP` / `en-US` 的 message 文件、locale 接线或批量机翻补全。
4. 核心三语（`zh-CN` / `ja-JP` / `en-US`）仍须保持 key 对齐与可用文案；其它语言等用户点头后再同步。

给 AI Agent / 贡献者的完整约定见 [AGENTS.md](./AGENTS.md)（新增文案、回退策略、新增语言步骤等）。

---

## 📄 开源许可与版权说明 (License & Credits)

- **项目前端代码**：采用 [AGPL v3](https://github.com/moe-sekai/moenotes/blob/main/LICENSE) 协议开源。
- **官方美术与音视频资产**：*BanG Dream! Our Notes* 官方美术图像、音视频、歌词等资产版权归属版权方 **Bushiroad / Craft Egg / Ishimori** 所有。本仓库仅用于非商业性研究和学习交流，不提供任何商业授权。
- **自制/重制兼容性资产**：由社区或 StarMoe 团队自制的兼容性静态资产，采用 **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** 知识共享署名-非商业性使用协议授权开源。
