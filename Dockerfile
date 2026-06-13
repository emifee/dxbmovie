# syntax=docker/dockerfile:1

# =============================================================================
# DXBmovies.Ai — multi-stage production image
# Uses Next.js standalone output so the final image carries only the traced
# runtime (server.js + minimal node_modules + static assets), not the full
# dependency tree or build toolchain.
# =============================================================================

# ---- Stage 1: deps -----------------------------------------------------------
# Install dependencies in isolation so this layer caches on lockfile changes.
FROM node:20-alpine AS deps
WORKDIR /app
# libc6-compat keeps some native deps happy on Alpine.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Stage 2: builder --------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Telemetry off for clean, reproducible CI builds.
ENV NEXT_TELEMETRY_DISABLED=1
# Provide dummy env vars so Next.js can collect page data without crashing.
# Real values are injected at runtime via docker-compose environment.
ARG MONGODB_URI="mongodb://placeholder:27017/build"
ARG NEXTAUTH_SECRET="build-secret"
ARG NEXTAUTH_URL="http://localhost:3000"
ENV MONGODB_URI=${MONGODB_URI}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}
RUN npm run build

# ---- Stage 3: runner ---------------------------------------------------------
# Minimal runtime. Runs as a non-root user.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone server + static assets + public dir.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# server.js is emitted by Next at the root of the standalone output.
CMD ["node", "server.js"]
