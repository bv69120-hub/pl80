# BV Expédition Pro

BV Expédition Pro est un monorepo professionnel pret pour demarrer une application
d'expedition composee d'une application web, d'une API Node.js, d'une application
desktop Electron et de packages partages.

Ce depot ne contient pas encore de fonctionnalite metier. Il fournit uniquement le
socle technique, les conventions de developpement et les points d'entree
compilables.

## Stack

- pnpm workspaces
- Turborepo
- React + Vite + TypeScript
- Node.js + Express + TypeScript
- Electron
- Prisma
- SQLite
- ESLint
- Prettier
- Husky
- lint-staged

## Prerequis Windows 10

- Windows 10 64 bits
- Node.js 20 LTS ou plus recent
- pnpm 9 ou plus recent
- Git for Windows
- PowerShell 5.1 ou PowerShell 7

Installation de pnpm si necessaire :

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

## Installation

```powershell
pnpm install
```

Copier ensuite le fichier d'environnement si besoin :

```powershell
Copy-Item .env.example .env
```

## Commandes principales

```powershell
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm format:check
```

Commandes Prisma :

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Structure

```text
apps/
  web/       Application web React + Vite
  api/       API Node.js + Express
  desktop/   Application desktop Electron + React + Vite

packages/
  ui/        Composants UI partages
  database/  Configuration Prisma + SQLite
  printer/   Socle d'integration impression pour Windows
  shared/    Constantes et types partages
```

## Applications

### Web

```powershell
pnpm --filter @bv/web dev
pnpm --filter @bv/web build
```

Le serveur Vite demarre par defaut sur `http://127.0.0.1:5173`.

### API

```powershell
pnpm --filter @bv/api dev
pnpm --filter @bv/api build
pnpm --filter @bv/api start
```

L'API expose une route technique `GET /health` et les routes
d'authentification.

### Desktop

```powershell
pnpm --filter @bv/desktop dev
pnpm --filter @bv/desktop build
```

Le package Electron contient le processus principal, le preload et le renderer
React. Le packaging installateur n'est pas encore configure afin de garder ce
premier socle strictement centre sur la compilation.

## Base de donnees

Le package `@bv/database` contient le schema Prisma :

```text
packages/database/prisma/schema.prisma
```

SQLite est configure via `DATABASE_URL`. La valeur de developpement recommandee
est :

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me-in-development"
JWT_EXPIRES_IN="8h"
```

Le schema Prisma contient les modeles techniques suivants :

- `User`
- `PrintJob`

La migration initiale est disponible dans :

```text
packages/database/prisma/migrations/20260626211000_init_auth/migration.sql
```

Le seed cree ou met a jour l'utilisateur administrateur :

```text
username: admin
password: Admin123!
role: ADMIN
```

## Authentification

Routes disponibles :

```text
POST /api/auth/login
GET /api/auth/me
```

Connexion :

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3333/api/auth/login `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"Admin123!"}'
```

La route retourne un JWT et l'utilisateur authentifie sans `passwordHash`.

Verification du token :

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri http://127.0.0.1:3333/api/auth/me `
  -Headers @{ Authorization = "Bearer <token>" }
```

L'API contient aussi :

- un middleware d'authentification `authenticate`
- un middleware de role `requireRole`

## Qualite

ESLint et Prettier sont configures a la racine du monorepo. Husky lance
`lint-staged` au pre-commit afin de formater et corriger les fichiers modifies.

```powershell
pnpm lint
pnpm format:check
```

## Notes de conception

- Les packages internes utilisent le prefixe `@bv/*`.
- Les sorties compilees sont placees dans `dist`.
- Les fichiers generes, bases SQLite locales et dossiers de build sont ignores
  par Git.
- Le projet cible Windows 10, tout en conservant des scripts compatibles avec
  PowerShell et les conventions Node.js modernes.
