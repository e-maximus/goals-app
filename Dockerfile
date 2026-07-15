# The app — UI, REST API and MCP endpoint in one Next.js server (see
# next.config.ts: output "standalone"). This is what Railway runs, and what
# docker-compose runs alongside Postgres.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# `standalone` emits a server plus the subset of node_modules it actually needs;
# the static assets and public/ are not traced into it and must be copied in.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER node
# Railway injects PORT. Bind to all interfaces or the platform can't reach us.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
