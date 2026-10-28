# MoeNotes deploy image: Go semi-SSR gateway + Next.js 16 standalone server (and compatible with CI release artifacts).
# Set MOENOTES_BUILD_MODE=ssr in production to serve live semi-SSR HTML + persistent disk cache + Markdown routing.

FROM oven/bun:1.3.14-alpine AS web-build
WORKDIR /web
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY next.config.ts postcss.config.mjs tsconfig.json ./
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY public/ ./public/

ARG PUBLIC_SITE_URL=""
ARG PUBLIC_ASSET_API=""
ARG PUBLIC_GAME_API=""
ARG PUBLIC_DECK_RECOMMEND_ENGINE=""
ARG PUBLIC_OPEN_PLATFORM_DOCS_URL=""
ARG PUBLIC_CF_BEACON_TOKEN=""
ARG PUBLIC_UMAMI_HOST_URL=""
ARG PUBLIC_UMAMI_SCRIPT_PATH=""
ARG PUBLIC_UMAMI_WEBSITE_ID=""
ARG PUBLIC_UMAMI_DOMAINS=""

RUN bun run build && \
    mkdir -p /nextjs/.next && \
    cp -r .next/standalone/. /nextjs/ && \
    cp -r .next/static /nextjs/.next/static && \
    cp -r public /nextjs/public && \
    cp .next/BUILD_ID /nextjs/.next/BUILD_ID

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

FROM alpine:3.24
RUN apk add --no-cache ca-certificates tini tzdata nodejs
COPY --from=go-build /out/moenotes /usr/local/bin/moenotes
COPY --from=go-build /out/source-digest /app/source-digest
COPY --from=web-build /nextjs /app/nextjs

ARG ZEABUR_GIT_COMMIT_SHA=""
ARG MOENOTES_REVISION=${ZEABUR_GIT_COMMIT_SHA}
ENV MOENOTES_REVISION=${MOENOTES_REVISION} \
    MOENOTES_SOURCE_DIGEST_FILE=/app/source-digest \
    MOENOTES_NEXTJS_DIR=/app/nextjs \
    MOENOTES_DATA_DIR=/data
EXPOSE 80

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["moenotes", "serve"]
