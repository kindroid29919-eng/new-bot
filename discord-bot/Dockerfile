FROM node:20-slim

WORKDIR /app

# Build tools in case @napi-rs/canvas has no prebuilt binary for this platform
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json ./

RUN npm install --omit=dev

# Copy the rest of the source
COPY . .

CMD ["node", "index.js"]
