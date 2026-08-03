FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000
RUN addgroup -S nimbus && adduser -S nimbus -G nimbus
COPY --from=builder --chown=nimbus:nimbus /app/.next/standalone ./
COPY --from=builder --chown=nimbus:nimbus /app/.next/static ./.next/static
COPY --from=builder --chown=nimbus:nimbus /app/public ./public
RUN mkdir -p /app/data && chown -R nimbus:nimbus /app/data
USER nimbus
EXPOSE 10000
CMD ["node", "server.js"]
