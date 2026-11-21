FROM node:22-bookworm-slim AS frontend-build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY resources ./resources
COPY pwa-assets ./pwa-assets
# Public Cloudflare Turnstile site key, baked into the bundle at build time.
ARG VITE_TURNSTILE_SITE_KEY=
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN npm run build

FROM rust:1.99-bookworm AS backend-build
WORKDIR /workspace
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential pkg-config \
    && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY services/app-backend/Cargo.toml services/app-backend/Cargo.toml
COPY services/app-backend/migrations services/app-backend/migrations
COPY services/app-backend/src services/app-backend/src
RUN cargo build --release -p app-backend

# Only used by compose.staging.yaml (profile "test"): the compile stage plus the integration tests.
FROM backend-build AS backend-test
COPY services/app-backend/tests services/app-backend/tests

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home app
WORKDIR /app
COPY --from=backend-build /workspace/target/release/app-backend /usr/local/bin/app-backend
COPY --chown=app:app public ./public
COPY --chown=app:app pwa-assets ./public
COPY --from=frontend-build --chown=app:app /workspace/public/spa ./public/spa
USER app
ENV APP_ADDR=0.0.0.0:8000
EXPOSE 8000
CMD ["app-backend"]
