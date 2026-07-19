FROM node:20-slim

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# Copy the rest of the source
COPY . .

CMD ["node", "index.js"]
