# MoeNotes

[English](./README.en.md) | 简体中文

MoeNotes 是由 [StarMoe](https://github.com/StarMoe-org) 团队为 BanG Dream! 企划 *Our Notes* 开发的静态数据与资料查看器。

项目基于静态站点架构构建，提供角色、卡面、活动、歌曲谱面、剧情等游戏数据的检索与多语言浏览。

## 特性

- 游戏数据检索：支持角色档案、卡面立绘、数值属性、活动剧情与歌曲谱面等资料查阅。
- 多语言架构：内置多语言界面切换，支持中、英、日、韩等语言的 masterdata 数据自动回退。
- 轻量手帐质感：采用手帐风格视觉设计，兼顾可读性与浏览体验。
- 静态优先：基于静态站点生成（SSG）与预渲染，首屏加载迅速。

## 技术栈

- 站点框架：Astro
- 交互组件：React 19
- 样式库：Tailwind CSS v4
- 开发语言：TypeScript
- 包管理器与运行环境：Bun

## 快速上手

本地开发前请先安装 [Bun](https://bun.sh/)。

### 1. 安装依赖

```bash
bun install
```

### 2. 启动本地开发服务

```bash
bun run dev
```

如遇本地缓存异常或热更新失效，可清理缓存并强制启动：

```bash
bun run dev:fresh
```

构建默认从远程镜像拉取 masterdata。如需指向本地数据目录，可指定环境变量：

```bash
MOENOTES_MASTERDATA_DIR=../ournotes-masterdata-1 bun run dev
```

### 3. 生产打包构建

```bash
bun run build
```

### 4. 本地预览打包产物

```bash
bun run preview
```

### 5. 代码检查

运行多语言、路由与规范检查：

```bash
bun run lint
```

## 关于 Astro 的一点吐槽

当初选型看中了 Astro 的静态优先与 Islands 架构，但面对游戏资料站这样重交互、重客户端状态的场景，实际开发起来真的挺不方便的（笑）。还是NEXT开发这种东西方便一点。

## 开源协议与版权说明

- 本项目源码采用 [AGPL-3.0](https://github.com/StarMoe-org/moenotes/blob/main/LICENSE) 协议开源。
- 游戏官方美术立绘、音频、剧情等资产版权均归属版权方 **Bushiroad / Craft Egg / Ishimori** 所有。
- 本项目为非商业性质的粉丝向技术研究与交流项目，不提供任何商业授权。
