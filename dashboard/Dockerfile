# All-In-Wonder Dashboard: configure .env, build/start/stop the stack, and
# list every service URL & credential — a SvelteKit app over the project root.
# Built and run on Bun; the adapter-node output is Node-API-compatible.
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run test && bun run build

FROM oven/bun:1-alpine
WORKDIR /app
# docker CLI: the Build/Start page actions run the project's build.sh/start.sh
# in the "toolbox" helper container against the host engine (socket mounted by
# install.sh) — same pattern the Windows .bat wrappers use.
# docker-cli-buildx adds the BuildKit builder so the one-time toolbox image build
# uses `docker buildx build` instead of the deprecated legacy builder.
RUN apk add --no-cache docker-cli docker-cli-buildx
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
# Run as root: with rootless Docker the host user maps to container root, so
# this is what makes the bind-mounted .env readable/writable — and files the
# app writes land on the host owned by the invoking user.
USER root
# install.sh mounts the project root here; the app reads .env.example and
# reads/writes .env inside it.
ENV ENV_DIR=/workspace
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "build/index.js"]
