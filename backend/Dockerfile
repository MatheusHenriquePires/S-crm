FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY prisma ./prisma
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont
EXPOSE 3001
CMD ["node", "dist/main.js"]
