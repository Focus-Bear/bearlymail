# Build stage
FROM node:24 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies using npm ci for faster, more reliable builds
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the NestJS application
# Increase Node.js heap size to prevent out-of-memory errors during build
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Prune devDependencies to reduce image size
RUN npm prune --omit=dev --legacy-peer-deps

# Production stage
FROM node:24

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy built application and node_modules from builder
# Note: We copy node_modules from builder to avoid parallel npm installs
# which can cause network timeouts (ECONNRESET) during Docker builds
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
# Copy prompt templates (required for LLM operations)
COPY --from=builder /app/promptfoo ./promptfoo

# Inject commit metadata as build args so the server can log the deployed version on boot.
# Pass --build-arg COMMIT_HASH=<sha> --build-arg BUILD_TIME=<iso> when running docker build.
ARG COMMIT_HASH=dev
ARG BUILD_TIME=unknown
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_TIME=$BUILD_TIME

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run as non-root user for security
USER node

# Start the application
CMD ["node", "dist/main.js"]

