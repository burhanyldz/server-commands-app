# Server Commands App

Standalone React admin app for managing directories, command definitions, and ad-hoc command-run queue.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` from `.env.example`.
3. Run development server:
   ```bash
   npm run dev
   ```
4. Create `.env.production.local` (gitignored) for local production-API testing:
   ```env
   VITE_API_BASE_URL=https://yourdomain.comx/server-commands-api
   VITE_APP_BASE_PATH=/
   ```
5. Run local app against production API:
   ```bash
   npm run prod
   ```

## IIS deployment under subpath

If this app is served from `https://yourdomain.comx/server-commands/`, set:

```env
VITE_APP_BASE_PATH=/server-commands/
VITE_API_BASE_URL=https://<your-api-host>
```

Then build:

```bash
npm run build
```

Important:
- `VITE_APP_BASE_PATH` must include both leading and trailing `/`.
- `VITE_API_BASE_URL` must be your reachable production API base URL (not localhost).

## Features

- Dedicated auth flow (login + first-admin bootstrap)
- Admin-only user creation/listing via **Kullanıcılar**; new admins share the command workspace
- Per-account optional TOTP via **Security → Set Up 2FA → Enable 2FA**
- Password and passkey login both request a TOTP code when the user enables 2FA
- Directory registry (server paths)
- Command library (label + shell command + runAsSystem)
- Ad-hoc command run queue
- Per-step logs/status and retry support
