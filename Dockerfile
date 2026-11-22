# FinCore Angular client — production image.
# Build:  docker build -t fincore-client .
# Run:    served by nginx on port 80 (HTTP only; HTTPS is terminated by the host reverse proxy).

# ---- Stage 1: build the Angular app ------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Reproducible install from the lock file (cached as long as package*.json do not change).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Production build (environment.ts: apiBaseUrl '/api', no source maps, hashed file names).
# Note: Google Fonts CSS is inlined at build time, so the build needs internet access.
RUN npx ng build --configuration production

# ---- Stage 2: serve with nginx (non-root) ------------------------------------------------------------------
FROM nginx:1.30-alpine

# Our own main config (non-root friendly: pid and temp files in /tmp) + site config.
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf

# The application builder writes the browser bundle to dist/fincore-client/browser.
COPY --from=build /app/dist/fincore-client/browser /usr/share/nginx/html

# Run as the unprivileged "nginx" user (uid 101). Port 80 still works: Docker sets
# net.ipv4.ip_unprivileged_port_start=0 inside containers (Docker 20.10+).
RUN chown -R nginx:nginx /var/cache/nginx /usr/share/nginx/html
USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
