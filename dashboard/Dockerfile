# SvelteKit dashboard (configure .env, build/start/stop the stack). Bun build;
# adapter-node output is Node-API-compatible.
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run test && bun run build

FROM oven/bun:1-alpine
WORKDIR /app
# docker CLI: page actions drive build.sh/start.sh in the toolbox container
# against the host engine. buildx provides the BuildKit builder for the
# one-time toolbox image build (legacy builder is deprecated).
RUN apk add --no-cache docker-cli docker-cli-buildx
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
# Run as root: rootless Docker maps the host user to container root, keeping the
# bind-mounted .env read/writable and host files owned by the invoking user.
USER root
# install.sh mounts the project root here; app reads .env.example, reads/writes .env.
ENV ENV_DIR=/workspace
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "build/index.js"]
