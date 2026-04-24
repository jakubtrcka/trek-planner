FROM node:22-slim

RUN apt-get update && apt-get install -y \
    libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libxkbcommon0 \
    libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

RUN pnpm exec playwright install chromium

COPY . .
RUN pnpm build

ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "start"]
