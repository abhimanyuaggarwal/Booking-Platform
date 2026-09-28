# Expert Sessions — one image: the api plus the built web app it serves.
# The web app is built BEFORE this image, on the machine that deploys (deploy/deploy.sh runs
# `pnpm --filter web build`), because the pilot server is small and Vite's build is not. The image
# only installs production dependencies and copies the api, the shared package and apps/web/dist.
#   docker build -f deploy/Dockerfile .      (deploy/docker-compose.yml does this for you)

FROM node:22-alpine
RUN npm install -g pnpm@12 --no-fund --no-audit && apk add --no-cache wget
ENV NODE_ENV=production
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod
COPY packages ./packages
COPY apps/api/src ./apps/api/src
COPY apps/api/db ./apps/api/db
COPY apps/api/config ./apps/api/config
COPY apps/web/dist ./apps/web/dist
ENV WEB_DIST=/app/apps/web/dist
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Migrations run first on every start; the schema is always current before the api listens.
WORKDIR /app/apps/api
CMD ["sh", "-c", "node src/migrate.js && exec node src/server.js"]
