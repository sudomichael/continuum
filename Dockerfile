# Continuum server image.
#
# Stage 1: build the Next.js app + generate the Prisma client.
# Stage 2: minimal runtime — just Node + the built artifacts.
#
# Build:
#   docker build -t continuum .
# Run:
#   docker run -p 3000:3000 \
#     -e DATABASE_URL='postgresql://...' \
#     -e ENCRYPTION_KEY="$(openssl rand -hex 32)" \
#     -e CONTINUUM_TOKEN="$(openssl rand -hex 24)" \
#     continuum
#
# The image expects DATABASE_URL to point at a reachable Postgres; it runs
# `prisma db push` on container start (idempotent).

# -------- Stage 1: build --------
FROM node:20-alpine AS build
WORKDIR /app

# OpenSSL is needed for Prisma at install time on Alpine.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma

# Skip the bootstrap step that postinstall normally runs against the DB —
# build-time has no DB. Prisma client is generated from the schema only.
ENV CONTINUUM_SKIP_BOOTSTRAP=1
RUN npm ci --include=dev

COPY . .

# next build runs bootstrap.ts → would normally need the DB. Guard with a
# build-time env var so bootstrap exits early; runtime entrypoint runs the
# real bootstrap with DB access.
RUN CONTINUUM_BUILD_ONLY=1 npm run build

# -------- Stage 2: runtime --------
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl bash

ENV NODE_ENV=production
ENV PORT=3000

# Copy only what next start needs at runtime.
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

# Run the bootstrap (env validate + prisma db push + admin seed) every
# container start, then hand off to Next. Bootstrap is idempotent.
CMD ["sh", "-c", "npx tsx scripts/bootstrap.ts && npm start"]
