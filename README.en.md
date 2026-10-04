# MoeNotes

English | [简体中文](./README.md)

MoeNotes is a static database and asset viewer for the *BanG Dream!* project *Our Notes*, developed by the [StarMoe](https://github.com/StarMoe-org) team.

Built as a static site, it provides browsing, filtering, and inspection of game data including characters, cards, events, story scenarios, and music beatmaps. If you want to explore the game metadata or track update dynamics, visit [moenotes-masterdata](https://github.com/StarMoe-org/moenotes-masterdata).

## Features

- Game Data Viewer: Browse character profiles, card illustrations, skill stats, event stories, and music charts.
- Multi-language Architecture: Localized UI with automatic fallback across Chinese, English, Japanese, and Korean masterdata.
- Notebook-inspired Aesthetics: Clean, paper-like UI design focused on readability and browsing comfort.
- Static First: Fast initial page loads powered by static site pre-rendering (SSG).

## Tech Stack

- Site Framework: Astro
- UI Components: React 19
- Styling: Tailwind CSS v4
- Language: TypeScript
- Package Manager & Runtime: Bun

## Getting Started

Prerequisites: [Bun](https://bun.sh/) is required.

### 1. Install Dependencies

```bash
bun install
```

### 2. Start Development Server

```bash
bun run dev
```

If you encounter stale Vite/Astro caches or broken HMR, clear the cache and force restart:

```bash
bun run dev:fresh
```

By default, masterdata is fetched from the remote mirror during build. To use a local directory:

```bash
MOENOTES_MASTERDATA_DIR=../ournotes-masterdata-1 bun run dev
```

### 3. Production Build

```bash
bun run build
```

### 4. Preview Production Build

```bash
bun run preview
```

### 5. Lint and Typecheck

Run i18n key alignment, route registry, and architecture checks:

```bash
bun run lint
```

## Commits and Releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are written in English (no CJK characters or full-width punctuation in the header or body), for example `feat(events): add exchange detail page` or `fix: stop dark mode flicker`. `bun install` enables the repository's commit-msg hook, which rejects other messages; CI also checks pull request titles, the commits in a pull request and commits pushed to `main`.

Versions follow Semantic Versioning. The notes for each version are on [GitHub Releases](https://github.com/StarMoe-org/moenotes/releases), generated from the commits by [git-cliff](https://git-cliff.org/):

```bash
bun run release          # next version from the commits; updates package.json, commits and tags
git push origin HEAD v0.2.0
```

Pushing a `v*` tag makes CI publish the matching GitHub release with its notes.

## A Note on Astro

We originally picked Astro for its static-first approach and Islands architecture. However, for a game database viewer with lots of interactive features and heavy client-side state, developing with it is honestly quite inconvenient (lol). Next.js would probably have been a lot more convenient for something like this.

## License and Disclaimer

- Source code is licensed under the [AGPL-3.0](https://github.com/StarMoe-org/moenotes/blob/main/LICENSE) license.
- All official artwork, audio, and scenario assets belong to **Bushiroad / Craft Egg / Ishimori**.
- This is a non-commercial fan project built for educational, community, and technical research purposes.
