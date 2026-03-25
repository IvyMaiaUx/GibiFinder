FROM node:22-alpine AS base
RUN npm install -g pnpm@10

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./

COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/gibifinder/package.json ./artifacts/gibifinder/

RUN pnpm install --no-frozen-lockfile

COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/gibifinder/ ./artifacts/gibifinder/

FROM base AS build

ENV PORT=8080
ENV BASE_PATH=/
ENV NODE_ENV=production

RUN pnpm --filter @workspace/gibifinder run build

RUN pnpm --filter @workspace/api-server run build

RUN cp -r /app/artifacts/gibifinder/dist/public /app/artifacts/api-server/dist/public
RUN cp -r /app/artifacts/gibifinder/public/. /app/artifacts/api-server/dist/public/ 2>/dev/null || true

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=build /app/artifacts/api-server/dist ./dist
COPY --from=build /app/artifacts/api-server/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
