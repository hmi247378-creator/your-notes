# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and app-specific config
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/

# Install dependencies (only web)
RUN npm install -w apps/web

# Copy source
COPY . .

# Build Next.js with static output
WORKDIR /app/apps/web
ENV NEXT_PUBLIC_API_BASE_URL=/api
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/apps/web/out /usr/share/nginx/html
# Copy nginx config
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
