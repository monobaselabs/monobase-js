# Multi-stage Dockerfile for standalone usage
# Build from services/api directory: docker build -t monobase-api .
# Build from monorepo root: docker build -f services/api/Dockerfile -t monobase-api .
# Note: Automatic Bun package caching is enabled via BuildKit cache mounts for faster builds

ARG BUILD_CONTEXT=monorepo

# Stage 1: Build API Specifications
FROM oven/bun:1.2.21-alpine AS spec-builder

WORKDIR /specs

# Copy specs source (assumes build from monorepo root)
COPY specs/api/package.json ./
COPY specs/api/src ./src/
COPY specs/api/tspconfig.yaml ./

# Install spec dependencies and build using bun (faster than npm)
RUN --mount=type=cache,target=/home/bun/.bun/install/cache bun install
RUN bun run build

# Stage 2: Build API Application  
FROM oven/bun:1.2.21-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy built specs from previous stage
COPY --from=spec-builder /specs/dist ./specs/api/dist
COPY --from=spec-builder /specs/package.json ./specs/api/

# Copy API service files (assumes build from monorepo root)
COPY services/api/package.json ./
RUN cat package.json | \
    sed 's/"@monobase\/api-spec": "workspace:\*"/"@monobase\/api-spec": "file:specs\/api"/' > package.temp.json && \
    mv package.temp.json package.json

# Install dependencies
RUN --mount=type=cache,target=/home/bun/.bun/install/cache bun install --production

# Copy source code
COPY services/api/src ./src
COPY services/api/scripts ./scripts
COPY services/api/tsconfig.json ./
COPY services/api/drizzle.config.ts ./

# Expose port (default production port)
EXPOSE 7213

# Health check (using PORT env variable for flexibility)
# Uses simple text response for faster, lightweight health checks
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-7213}/readyz || exit 1

# Start the application
CMD ["bun", "run", "start"]