# Build từ thư mục gốc repo: docker compose build worker
FROM node:24-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter "@cp/worker..."

# Chromium + thư viện hệ thống cho Playwright
RUN cd apps/worker && npx playwright install --with-deps chromium

COPY packages/shared packages/shared
COPY apps/worker apps/worker

ENV NODE_ENV=production \
    DATA_DIR=/data \
    HEADLESS=true
VOLUME /data

CMD ["pnpm", "--filter", "@cp/worker", "start"]
