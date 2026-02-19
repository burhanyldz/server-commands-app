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

## Features

- Dedicated auth flow (login + first-admin bootstrap)
- Directory registry (server paths)
- Command library (label + shell command + runAsSystem)
- Ad-hoc command run queue
- Per-step logs/status and retry support
