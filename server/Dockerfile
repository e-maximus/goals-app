# Build context is the repository root, not server/ — the server shares its
# domain types with the web app (src/lib/types.ts) and compiles them in.

FROM node:22-alpine AS build
WORKDIR /repo

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

COPY server/tsconfig.json ./server/
COPY server/scripts ./server/scripts
COPY server/src ./server/src
COPY src/lib/types.ts ./src/lib/types.ts

RUN cd server && npm run build


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /repo/server/dist ./dist

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT??8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/src/index.js"]
