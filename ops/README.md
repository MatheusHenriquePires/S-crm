# Ops quickstart

## Env
- Copie `backend/.env.example` para `backend/.env` e ajuste `CORS_ORIGINS`, `LOG_LEVEL`, rate limit (`RATE_LIMIT_*`) e segredos (JWT, DB, WPP).

## HTTPS local via Caddy
- Requer backend rodando em `http://localhost:3001`.
- Rode o proxy: `docker compose -f ops/compose.proxy.yaml up -d`.
- Use `https://localhost:8443` como origem; adicione esse origin em `CORS_ORIGINS`.

## Stack com Docker Compose
- Arquivo: `ops/docker-compose.yaml`.
- Sobe backend (porta 3001), frontend (porta 4173) e Caddy (80/443 -> backend).
- Passos:
  1. Crie `backend/.env` a partir do exemplo.
  2. `docker compose -f ops/docker-compose.yaml build`
  3. `docker compose -f ops/docker-compose.yaml up -d`
- O frontend serve em `http://localhost:4173` (ou atrás do Caddy em `https://localhost:8443`); ajuste `CORS_ORIGINS` para incluir esses hosts.

## Healthcheck
- `GET /health` retorna `{ status: "ok" }`. Configure seu load balancer para usá-lo.

## CI
- Workflow em `.github/workflows/ci.yml` roda lint/test/build em backend e build no frontend.
