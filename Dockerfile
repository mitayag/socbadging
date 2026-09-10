FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=mysql://build:build@localhost:3306/build
ENV APP_URL=http://localhost:3000
COPY . .
RUN npm run db:generate && npm run build

FROM deps AS tools
WORKDIR /app
COPY . .
ENV DATABASE_URL=mysql://build:build@localhost:3306/build
RUN npm run db:generate

FROM tools AS worker
ENV NODE_ENV=production
CMD ["npm", "run", "worker"]

FROM tools AS signer
ENV NODE_ENV=production
EXPOSE 3101
CMD ["npm", "run", "signer"]

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
