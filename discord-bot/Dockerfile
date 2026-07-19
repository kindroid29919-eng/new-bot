FROM node:20-slim

WORKDIR /app

# Build tools in case @napi-rs/canvas has no prebuilt binary for this platform
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Upgrade npm — older npm has a known "Exit handler never called!" bug that
# can silently truncate an install while still reporting success.
RUN npm install -g npm@latest

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json ./

RUN npm install --omit=dev --no-audit --no-fund

# Fail the BUILD (not just the runtime) if a listed dependency didn't
# actually make it into node_modules, so this can never ship silently broken again.
RUN test -d node_modules/dotenv || (echo "ERROR: dotenv missing after npm install!" && exit 1)
RUN test -d node_modules/discord.js || (echo "ERROR: discord.js missing after npm install!" && exit 1)

# Copy the rest of the source
COPY . .

CMD ["node", "index.js"]
