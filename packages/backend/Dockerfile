# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src/ src/
RUN npx tsc

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist/ dist/
COPY src/db/schema.sql dist/db/schema.sql

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/index.js"]
