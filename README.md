# elec-ha – Comparateur d'options tarifaires EDF depuis Home Assistant

Interface web autonome qui exploite l'historique de consommation collecté par Home Assistant
pour simuler le coût des trois options du Tarif Bleu EDF (**Base**, **HP/HC**, **Tempo**)
et les comparer côte à côte, avec un mode de « lissage » des jours rouges Tempo.

📄 Spécification fonctionnelle et technique : [docs/SPEC.md](docs/SPEC.md)

## Stack (cible)

- Monorepo pnpm : `packages/core` (moteur de calcul pur), `apps/api` (Fastify), `apps/web` (React + Vite + ECharts)
- SQLite (`better-sqlite3` + `drizzle-orm`) pour la configuration et le cache
- Image Docker multi-stage unique, `docker compose up`

## Développement

Prérequis : Node ≥ 22, pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # API sur http://localhost:3000, SPA sur http://localhost:5173 (proxy /api)
pnpm lint         # ESLint + Prettier
pnpm typecheck
pnpm test         # Vitest
pnpm build
```

L'API exige la variable `APP_SECRET` (≥ 16 caractères), par exemple :

```bash
APP_SECRET=$(openssl rand -hex 32) pnpm --filter @elec-ha/api dev
```

## Déploiement Docker

```bash
cp .env.example .env   # renseigner APP_SECRET
docker compose up -d   # http://localhost:3000, données SQLite dans ./data
```

Variables : `APP_SECRET` (obligatoire), `PORT` (défaut 3000), `TZ` (défaut `Europe/Paris`).

## ⚠️ Sécurité

L'application est prévue pour un **réseau local** et n'embarque **aucune authentification** en V1.
Ne l'exposez pas sur Internet sans reverse proxy authentifiant.

## Suivi

Le développement est découpé en lots (voir §8 de la spec), suivis dans les issues et le projet GitHub du dépôt.
