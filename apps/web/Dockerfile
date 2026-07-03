# Skowt Web Dockerfile for Railway deployment
# Multi-stage build for TanStack Start (Vite SSR)

FROM oven/bun:1.3.2-alpine AS base
WORKDIR /app

# Install dependencies stage
FROM base AS deps
COPY package.json bun.lock* ./
COPY apps/web/package.json ./apps/web/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
RUN bun install --frozen-lockfile

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the packages and web app
RUN bun run --cwd packages/db build || true
RUN bun run --cwd packages/auth build || true
RUN bun run --cwd packages/api build || true
RUN bun run --cwd apps/web build

# Production stage
FROM base AS runner
ENV NODE_ENV=production

# Copy only what's needed for production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/package.json ./

WORKDIR /app/apps/web

EXPOSE 1337

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:1337/ || exit 1

CMD ["bun", "run", "serve"]
