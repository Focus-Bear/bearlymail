# Build stage — compile the Vite app to static assets
FROM node:24 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# The API base URL is baked into the bundle at build time (Vite convention).
# Override with --build-arg VITE_API_URL=https://api.your-domain when building.
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Serve stage — static files behind nginx with SPA fallback
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1
