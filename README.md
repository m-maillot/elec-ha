# elec-ha – Comparateur d'options tarifaires EDF depuis Home Assistant

Interface web autonome qui exploite l'historique de consommation collecté par Home Assistant
pour simuler le coût des trois options du Tarif Bleu EDF (**Base**, **HP/HC**, **Tempo**)
et les comparer côte à côte, avec un mode de « lissage » des jours rouges Tempo.

📄 Spécification fonctionnelle et technique : [docs/SPEC.md](docs/SPEC.md)

## Stack (cible)

- Monorepo pnpm : `packages/core` (moteur de calcul pur), `apps/api` (Fastify), `apps/web` (React + Vite + ECharts)
- SQLite (`better-sqlite3` + `drizzle-orm`) pour la configuration et le cache
- Image Docker multi-stage unique, `docker compose up`

## ⚠️ Sécurité

L'application est prévue pour un **réseau local** et n'embarque **aucune authentification** en V1.
Ne l'exposez pas sur Internet sans reverse proxy authentifiant.

## Suivi

Le développement est découpé en lots (voir §8 de la spec), suivis dans les issues et le projet GitHub du dépôt.
