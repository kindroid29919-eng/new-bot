FROM node:20-slim

# Enable pnpm via corepack
RUN corepack enable

WORKDIR /app

# Copy lockfile + package.json files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .

RUN pnpm install --no-frozen-lockfile

CMD ["node", "index.js"]
