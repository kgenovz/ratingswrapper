FROM node:18-bullseye-slim

ENV NODE_ENV=production \
    PORT=7000

WORKDIR /app

# Install build tools for native modules like better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY imdb-ratings-api/package*.json ./imdb-ratings-api/

RUN npm ci --only=production && \
    npm ci --only=production --prefix imdb-ratings-api

COPY src ./src
COPY public ./public
COPY imdb-ratings-api ./imdb-ratings-api
COPY README.md ./README.md

EXPOSE 7000

ENV EMBED_RATINGS_API=true \
    RATINGS_PORT=3001

CMD ["npm", "start"]
