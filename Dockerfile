FROM node:18-alpine

ENV NODE_ENV=production \
    PORT=7000

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
COPY README.md ./README.md

EXPOSE 7000

CMD ["npm", "start"]

