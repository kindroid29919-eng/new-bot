FROM node:20-slim

WORKDIR /app

# Build tools in case @napi-rs/canvas has no prebuilt binary for this platform
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json ./

# npm has a known "Exit handler never called!" bug that can silently
# truncate an install while the shell command still reports success.
# So: install, then verify — retry up to 3 times until it's actually complete.
RUN for i in 1 2 3; do \
      echo "Install attempt $i..."; \
      rm -rf node_modules; \
      npm install --omit=dev --no-audit --no-fund; \
      if [ -d node_modules/dotenv ] && [ -d node_modules/discord.js ]; then \
        echo "Install verified OK."; \
        exit 0; \
      fi; \
      echo "Attempt $i incomplete, retrying..."; \
    done; \
    echo "ERROR: npm install never completed successfully after 3 attempts." && exit 1

# Copy the rest of the source
COPY . .

CMD ["node", "index.js"]
