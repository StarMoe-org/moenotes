# MoeNotes deploy image: Go semi-SSR gateway + Next.js 16 standalone server + Haneoka WASM deck engine
# (also backward-compatible with CI release artifact mode when MOENOTES_BUILD_MODE is unset).
# Set MOENOTES_BUILD_MODE=ssr in production to serve live semi-SSR HTML + persistent disk cache + Markdown routing.

FROM rust:1.88-slim-bookworm AS haneoka-build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN rustup target add wasm32-unknown-unknown
COPY --from=oven/bun:1.3.14-debian /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /build
COPY package.json tsconfig.json ./
COPY patches/ ./patches/
COPY scripts/build-haneoka-engine.mjs ./scripts/build-haneoka-engine.mjs
COPY src/lib/deck/haneoka/ ./src/lib/deck/haneoka/
RUN bun scripts/build-haneoka-engine.mjs --out /haneoka-out

FROM node:22-bookworm-slim AS web-build
COPY --from=oven/bun:1.3.14-debian /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /web
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY next.config.ts postcss.config.mjs tsconfig.json ./
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY public/ ./public/

ARG PUBLIC_ASSET_API=""
ARG PUBLIC_GAME_API=""
ARG PUBLIC_RECOGNITION_SITE=""
ARG PUBLIC_CHART_SITE=""
ARG PUBLIC_STORY_SITE=""
ARG PUBLIC_STORY_SITE_JP=""
ARG PUBLIC_MUSIC_DATA_SITE=""
ARG PUBLIC_MUSIC_DATA_SITE_JP=""
ARG PUBLIC_MUSIC_PLAYER_SITE=""
ARG ZEABUR_GIT_COMMIT_SHA=""
ARG MOENOTES_REVISION=${ZEABUR_GIT_COMMIT_SHA}

ENV NEXT_TELEMETRY_DISABLED=1 \
    MOENOTES_REVISION=${MOENOTES_REVISION}

RUN bun run build && \
    mkdir -p /nextjs/.next && \
    cp -r .next/standalone/. /nextjs/ && \
    cp -r .next/static /nextjs/.next/static && \
    cp -r public /nextjs/public && \
    cp .next/BUILD_ID /nextjs/.next/BUILD_ID
COPY --from=haneoka-build /haneoka-out /nextjs/public/haneoka-team-engine

FROM golang:1.25-alpine AS go-build
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/moenotes ./cmd/moenotes
COPY next.config.ts postcss.config.mjs package.json bun.lock tsconfig.json /site/
COPY src/ /site/src/
COPY public/ /site/public/
RUN /out/moenotes source-digest /site > /out/source-digest
# Offline smoke test: a broken server fails the image build, so the running deployment stays up.
RUN /out/moenotes self-check

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini tzdata && rm -rf /var/lib/apt/lists/*
COPY --from=go-build /out/moenotes /usr/local/bin/moenotes
COPY --from=go-build /out/source-digest /app/source-digest
COPY --from=web-build /nextjs /app/nextjs

ARG ZEABUR_GIT_COMMIT_SHA=""
ARG MOENOTES_REVISION=${ZEABUR_GIT_COMMIT_SHA}
ENV MOENOTES_REVISION=${MOENOTES_REVISION} \
    MOENOTES_SOURCE_DIGEST_FILE=/app/source-digest \
    MOENOTES_NEXTJS_DIR=/app/nextjs \
    MOENOTES_DATA_DIR=/data \
    MOENOTES_MASTERDATA_CACHE_DIR=/data/masterdata_cache
EXPOSE 80

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["moenotes", "serve"]
