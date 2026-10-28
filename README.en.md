# MoeNotes

English | [简体中文](./README.md)

MoeNotes is a game database and companion toolkit for the *BanG Dream!* project *Our Notes*, developed by the [StarMoe](https://github.com/StarMoe-org) team.

Built on a **Next.js 16 + Go Semi-SSR** architecture, it combines near-instant MasterData timeliness with static-grade response latency for browsing characters, cards, events, gachas, story scenarios, Live2D models, 3D music beatmaps, and Rust/WASM team building. To explore raw game metadata or track upstream updates, visit [moenotes-masterdata](https://github.com/StarMoe-org/moenotes-masterdata).

## Features

- **Comprehensive Game Database & Tools**: Browse character profiles, card illustrations and max-level stats, event schedules, gacha rates, exchanges/shops, Live2D viewer, story player, 3D chart preview, and automated deck building.
- **Semi-SSR Timeliness & Versioned MasterData Caching**:
  - Go gateway fronts Next.js standalone with a persistent gzipped HTML/Markdown disk cache (`singleflight` request coalescing + idle background warmup);
  - Every MasterData fetch carries an explicit server version (`?v=`), while `current_version.json` always penetrates CDN and local caches on every check;
  - The top-right **Settings → Data** drawer displays live cloud vs. current-page versions across TW / JP / EN / KR and provides a one-click **Force Refresh Data** action.
- **Crawler & AI-Friendly Dual Routing (HTML + Markdown)**:
  - Every route across all 13 locales supports `Accept: text/markdown` content negotiation as well as dedicated `.md` URLs (e.g. `/cards/71.md`, `/ja/events/4.md`), returning clean YAML-frontmatter Markdown with `X-Markdown-Tokens`;
  - Ships `/llms.txt`, `/llms-full.txt`, `/api/v1/meta/version`, and semantic SSR entity SEO shells.
- **Multi-language & Multi-server Fallback**: Localized UI in 13 languages with automatic fallback across TW, JP, EN, and KR MasterData.
- **Material Design 3**: MUI components powered by M3 dynamic color tokens seeded from band colors across light and dark themes (see `VISUAL_DESIGN.md`).

The deck builder embeds the Haneoka Rust WASM recommendation engine (see [docs/haneoka-engine.md](docs/haneoka-engine.md)) and also offers **Export for Haneoka** alongside a [Haneoka team builder](https://haneoka.org/en/team-builder/) link. Linked saves export the loaded inventory while preserving unknown, conflicting, and review states without exposing save links or observation history. **Export backup** continues to back up the MoeNotes box.

## Tech Stack

- **App Framework**: Next.js 16 (App Router, `output: "standalone"`)
- **Edge Gateway & Cache Server**: Go 1.25 (Semi-SSR reverse proxy, persistent HTML/Markdown disk cache, Next.js supervisor, and version watcher)
- **UI Components**: React 19, MUI (Material Design 3 + Emotion SSR)
- **Compute Engines**: Rust / WebAssembly (Haneoka team engine, beatmap chart renderer)
- **Styling**: Tailwind CSS v4
- **Language & Tooling**: TypeScript, Bun

## Getting Started

Prerequisites: [Node.js 22+](https://nodejs.org/) and [Bun](https://bun.sh/) (plus Go 1.25+ when building the Go gateway locally).

### 1. Install Dependencies

```bash
bun install
```

### 2. Start Development Server

```bash
bun run dev
```

If you encounter stale `.next` bundler caches, clear the cache and restart cleanly:

```bash
bun run dev:fresh
```

By default, MasterData is fetched from `metadata.bdon.moe`. To read from a local `moenotes-masterdata` checkout instead:

```bash
MOENOTES_MASTERDATA_DIR=../moenotes-masterdata bun run dev
```

### 3. Production Build & Local Preview

```bash
bun run build
bun run preview
```

### 4. Lint, Typecheck & Tests

```bash
bun run lint
bun run check
bun test tests/
```

## Deployment

MoeNotes follows the same containerized deployment model as [Moesekai](https://github.com/StarMoe-org/Moesekai) and supports **one-click `Dockerfile` deployment on Zeabur k3s** with zero required environment variables (auto-enabling Go + Next.js Semi-SSR mode and `/data` cache directories). See [docs/deployment.md](docs/deployment.md) for full configuration and cache-bypass API details.

## Commits and Releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are written in English (no CJK characters or full-width punctuation in the header or body), for example `feat(events): add exchange detail page` or `fix: stop dark mode flicker`. `bun install` enables the repository's `commit-msg` hook, which rejects other messages; CI also checks pull request titles, the commits in a pull request, and commits pushed to `main`.

Versions follow Semantic Versioning. Release notes are published on [GitHub Releases](https://github.com/StarMoe-org/moenotes/releases) and generated from commits by [git-cliff](https://git-cliff.org/):

```bash
bun run release          # next version from the commits; updates package.json, commits and tags
git push origin HEAD v0.2.0
```

Pushing a `v*` tag triggers CI to publish the matching GitHub Release with its notes.

## Architecture Evolution

We originally picked Astro for its static-first Islands architecture, but for a heavily interactive game database with rich client state and frequent live event/card drops, full static pre-rendering proved cumbersome in both build times and day-to-day ergonomics (lol). Migrating to **Next.js 16 + Go Semi-SSR + Markdown crawler routing** alongside `Moesekai` gives us instant timeliness without sacrificing cached response speed.

## License and Disclaimer

- Source code is licensed under the [AGPL-3.0](https://github.com/StarMoe-org/moenotes/blob/main/LICENSE) license.
- All official artwork, audio, and scenario assets belong to **Bushiroad / Craft Egg / Ishimori**.
- This is a non-commercial fan project built for educational, community, and technical research purposes.
