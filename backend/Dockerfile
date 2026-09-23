# Stage 1: Dependency & Build
FROM node:20-alpine AS builder

# Install necessary system libraries for Prisma and compilation
RUN sed -i 's/https/http/g' /etc/apk/repositories
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy only dependency manifests first to leverage layer cachinggg
COPY backend/package.json backend/package-lock.json* ./

# Install all dependencies (development + production)
RUN npm ci || npm install

# Copy the entire source code (necessary for builds)
COPY backend/ ./

# Generate Prisma Client and build
RUN npx prisma generate
RUN npm run build

# Prune development dependencies
RUN npm prune --omit=dev

# Stage 2: Minimal Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Install openssl for Prisma compatibility on Alpine
RUN sed -i 's/https/http/g' /etc/apk/repositories
RUN apk add --no-cache openssl

# Copy only the essentials: pruned node_modules, compiled dist folders, Prisma schema, and package info
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 4000

# Clean backend startup (only API, no DB operations like migrate deploy)
CMD ["node", "dist/index.js"]
