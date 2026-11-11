# Imagem da API (Fastify + Prisma). Construída a partir da raiz do monorepo:
#   docker build -f apps/api/Dockerfile -t cardapio-api .
FROM node:24-slim

# O Prisma precisa do OpenSSL para falar com o PostgreSQL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Dependências (camada em cache enquanto os package.json não mudarem)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --workspace @cardapio/api --include-workspace-root --no-audit --no-fund

# 2) Código
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run db:generate -w @cardapio/api

ENV NODE_ENV=production
EXPOSE 8080

# Aplica as migrations, garante os dados de demonstração (idempotente) e sobe a API.
CMD ["sh", "-c", "npm run db:deploy -w @cardapio/api && npm run db:seed -w @cardapio/api && npm run start -w @cardapio/api"]
