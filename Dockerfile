# syntax=docker/dockerfile:1

# Base glibc : package-lock.json résout oxide/lightningcss en variantes -gnu.
FROM node:24-bookworm-slim AS deps
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /build
ENV NODE_ENV=production TZ=Europe/Paris
COPY --from=deps /build/node_modules ./node_modules
COPY . .
RUN npm run data:publish && npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tzdata
ENV NODE_ENV=production TZ=Europe/Paris HOST=0.0.0.0 PORT=3000
# .output aplati dans /app : dispo.get.ts lit process.cwd()/public/data/.
COPY --from=build --chown=node:node /build/.output/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
