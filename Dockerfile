# MoeNotes deploy image: the Bun runtime and the site sources. The container serves the live build from the
# /data volume and rebuilds the site in the background when the asset service publishes a release or the image
# brings changed code; see docs/deployment.md.
FROM oven/bun:1.3.14-alpine

# Bun is not an init process; tini forwards signals and reaps the build's child processes.
RUN apk add --no-cache tini

WORKDIR /app

COPY package.json bun.lock ./
COPY patches/ ./patches/
RUN bun install --frozen-lockfile

COPY . .

# The commit the footer names; the image has no .git. Zeabur provides ZEABUR_GIT_COMMIT_SHA at build time, other
# builds pass --build-arg MOENOTES_REVISION=$(git rev-parse HEAD).
ARG ZEABUR_GIT_COMMIT_SHA=""
ARG MOENOTES_REVISION=${ZEABUR_GIT_COMMIT_SHA}
ENV MOENOTES_REVISION=${MOENOTES_REVISION}

# Offline smoke test of the server: a broken server fails the image build, so the running deployment stays up.
RUN bun server/main.ts --self-check

ENV MOENOTES_DATA_DIR=/data
EXPOSE 80

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "server/main.ts"]
