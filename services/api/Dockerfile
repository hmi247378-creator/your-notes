# Use Node.js 22 LTS
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root mapping and app-specific config
COPY package.json package-lock.json ./
COPY services/api/package.json ./services/api/

# Install dependencies
RUN npm install -w services/api

# Copy source
COPY . .

# Generate Prisma client and build
WORKDIR /app/services/api
RUN npx prisma generate
RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

# 只需要从 builder 复制必要的运行文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/api/dist ./dist
COPY --from=builder /app/services/api/package.json ./package.json

EXPOSE 3001

CMD ["node", "dist/main.js"]

