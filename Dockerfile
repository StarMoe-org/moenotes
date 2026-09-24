FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM caddy:2-alpine

ENV SITE_ADDRESS=:80

COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/ /srv/

EXPOSE 80 443
