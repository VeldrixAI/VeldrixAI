# ── Dependencies ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline 2>/dev/null || npm install

# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (non-secret public values only)
ARG NEXT_PUBLIC_API_BASE=http://localhost
ARG NEXT_PUBLIC_APP_URL=http://localhost:5000
ARG NEXT_PUBLIC_ENV=production
ARG NEXT_PUBLIC_VELDRIX_CORE_URL=http://localhost:8001
ARG NEXT_PUBLIC_VELDRIX_CORE_API_URL=http://localhost:8001
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown

ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_ENV=${NEXT_PUBLIC_ENV} \
    NEXT_PUBLIC_VELDRIX_CORE_URL=${NEXT_PUBLIC_VELDRIX_CORE_URL} \
    NEXT_PUBLIC_VELDRIX_CORE_API_URL=${NEXT_PUBLIC_VELDRIX_CORE_API_URL} \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build

# ── Development ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

# Install dependencies for development
RUN apk add --no-cache libc6-compat

# Copy package files first
COPY package.json package-lock.json* ./

# Install all dependencies including devDependencies
RUN npm install

# Copy source code
COPY . .

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1

EXPOSE 5000
CMD ["npm", "run", "dev"]

# ── Production ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.title="veldrixai-frontend"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy necessary config files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 5000
ENV PORT=5000 \
    HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]