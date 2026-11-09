# Build từ thư mục gốc repo: docker compose build worker
FROM node:24-bookworm-slim

WORKDIR /app

# Máy có phần mềm kiểm tra HTTPS (Kaspersky, proxy công ty...): đặt chứng chỉ CA gốc dạng PEM (*.crt)
# vào apps/worker/certs/ (không commit) để Node tin cậy cả lúc build lẫn lúc chạy. Không có file thì bỏ qua.
COPY apps/worker/certs/ /tmp/extra-ca/
RUN cat /tmp/extra-ca/*.crt > /etc/extra-ca.pem 2>/dev/null || true; rm -rf /tmp/extra-ca
ENV NODE_EXTRA_CA_CERTS=/etc/extra-ca.pem

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
