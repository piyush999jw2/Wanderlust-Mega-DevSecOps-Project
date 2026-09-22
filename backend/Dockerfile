# -------------------------
# Build stage
# -------------------------
FROM node:21-slim AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .


# -------------------------
# Production stage
# -------------------------
FROM node:21-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /app .

EXPOSE 5000

CMD ["node", "server.js"]
