# ==============================================================================
# Nonotion Web Dockerfile
# Multi-stage build for React SPA served by nginx
# ==============================================================================

# Stage 1: Install dependencies
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy package.json files for all packages
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage 2: Build
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Build-time environment variables
ARG VITE_API_URL=/api

# Build shared package first, then web
RUN pnpm --filter @nonotion/shared build && \
    VITE_API_URL=${VITE_API_URL} pnpm --filter @nonotion/web build

# ==============================================================================
# Stage 3: Production (nginx)
FROM nginx:alpine AS runner

# Install envsubst for environment variable substitution
RUN apk add --no-cache gettext

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config template
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Environment variables for nginx template
ENV API_UPSTREAM=api:3001

# Expose port
EXPOSE 80

# Health check (use 127.0.0.1 to avoid IPv6 issues in Alpine)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

# Start nginx with environment variable substitution
CMD ["/bin/sh", "-c", "envsubst '${API_UPSTREAM}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
