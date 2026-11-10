FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS tools
WORKDIR /app
RUN apk add --no-cache git && addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs \
    && git config --system --add safe.directory /content/repository/Architecture
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json tsconfig.json ./
COPY migrations ./migrations
COPY scripts ./scripts
COPY src ./src
USER nextjs

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apk add --no-cache git && addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs \
    && git config --system --add safe.directory /content/repository/Architecture
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
