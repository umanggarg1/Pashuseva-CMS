# CRM — Customer, Orders, Products & Delivery Management

This workspace contains a phased implementation plan for a CRM focused on customers, orders, products, and delivery tracking.

Core requirements and data model are defined in `crm.md`. The phase-by-phase build order (Phase 1 through Phase 14) is defined in `phases.md`. Current status and changelog live in `about.md`. For setup, conventions, and a step-by-step build guide, see `development.md`.

Project layout (Phase 1 skeleton):

- frontend/ — React + Vite + TypeScript app (scaffold placeholder)
- backend/ — Node + Express + TypeScript API (scaffold placeholder)

See `crm.md` for full requirements and `phases.md` for the phased plan.

## Developer — Run placeholders

To run the backend placeholder server:

```bash
cd backend
npm install   # optional, placeholder package.json exists
npm run dev
```

To run the frontend placeholder (Vite scaffolding to add):

```bash
cd frontend
npm install   # optional, placeholder package.json exists
npm run dev
```

Add real dependencies and replace placeholder scripts when you start implementing Phase 1 frontend and backend stacks.

## Phase 1 — Completed Work

The following Phase 1 tasks and scaffolding have been completed and committed to this workspace:

- Created the full project requirements and spec: `crm.md`
- Repository skeleton and documentation: `README.md` (this file)
- Tooling files: `.gitignore`, `.env.example`, `.editorconfig`, `.eslintrc.json`, `.prettierrc`
- Backend (TypeScript + Express + Prisma):
  - `backend/package.json`, `backend/tsconfig.json`, `backend/README.md`
  - Basic Express app and health route: `backend/src/app.ts`, `backend/src/routes/health.ts`, `backend/src/index.ts`
  - Prisma schema with core models: `backend/prisma/schema.prisma`
  - Prisma client wrapper: `backend/src/lib/prisma.ts`
  - Backend `.env.example` with `DATABASE_URL` and `PORT` placeholders
- Frontend (Vite + React + TypeScript + Tailwind) scaffold:
  - `frontend/package.json`, `frontend/vite.config.ts`, `frontend/index.html`
  - React entry and routes: `frontend/src/main.tsx`, `frontend/src/App.tsx`
  - Basic layout components: `frontend/src/components/Sidebar.tsx`, `Navbar.tsx`, `PageContainer.tsx`
  - UI placeholders: `Card`, `Button`, `Table`, `Dialog`, `Toast` in `frontend/src/components`
  - Tailwind config and styles: `frontend/tailwind.config.cjs`, `frontend/postcss.config.cjs`, `frontend/src/styles/tailwind.css`

## Next steps (recommended)

1. Configure a local PostgreSQL database and update `backend/.env` from `backend/.env.example`.
2. From `backend/`: run `npx prisma generate` and `npx prisma migrate dev --name init` to generate the client and apply the schema.
3. Implement Authentication (register/login) and secure APIs with JWT.
4. Begin Customer CRUD endpoints and frontend pages (Phase 4).

If you want, I can run through the Prisma migration steps next or scaffold the Authentication endpoints now.

## Running both frontend and backend

This repo is configured as an npm workspace. From the repository root you can:

```bash
# install all dependencies for workspace packages
npm run install-all

# run backend and frontend concurrently (opens two processes in the same shell)
npm run dev

# or run individually in separate terminals
npm run dev:backend
npm run dev:frontend
```

Notes:

- The `dev` script uses a simple shell `&` to start both processes; on Windows you may prefer running `dev:backend` and `dev:frontend` in two separate terminals.
- Update `backend/.env` before running Prisma migrations.
