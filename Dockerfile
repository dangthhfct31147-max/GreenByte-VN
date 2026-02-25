# =============================================================================
# ECO-PRODUCT DOCKERFILE
# =============================================================================
# Based on ContestHub_4 reference optimization
# Multi-stage build for Railway deployment

# -----------------------------------------------------------------------------
# BUILD STAGE
# -----------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:20-alpine AS builder

WORKDIR /app

# Install build dependencies (needed for some node modules)
RUN apk add --no-cache python3 make g++
RUN npm install -g npm@11.10.1

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
# Using --legacy-peer-deps to avoid conflicts if any
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build frontend and backend
ENV NODE_ENV=production
RUN npm run prisma:generate
RUN npm run build
RUN npm run build:server

# Remove devDependencies to verify isolation (optional step, but good practice)
# We will do a clean install in runner stage anyway

# -----------------------------------------------------------------------------
# RUNNER STAGE
# -----------------------------------------------------------------------------
FROM public.ecr.aws/docker/library/node:20-alpine AS runner

# Install dumb-init and openssl
RUN apk add --no-cache dumb-init openssl
RUN npm install -g npm@11.10.1

WORKDIR /app

# Create a non-root user (node user exists by default in alpine node images)
# Setting up permissions
RUN chown -R node:node /app

# Copy package files
COPY --chown=node:node package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --legacy-peer-deps && \
    npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/backend/dist ./backend/dist
COPY --from=builder --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Generate Prisma Client in production
RUN npx prisma generate

# Copy necessary config and static assets
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/public ./dist/public

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Switch to non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["dumb-init", "node", "backend/dist/index.js"]
