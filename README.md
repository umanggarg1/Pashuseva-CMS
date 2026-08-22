# Pashuseva CRM

A CRM built for **Pashuseva 24 Carat Gold** (Akash Enterprises) — an animal herbal treatment products business — to manage customers, products, orders, payments, and deliveries end to end, including generating printable courier shipping labels.

## What it does

- **Customers** — contact records with multiple phone numbers, addresses, notes, and a full activity timeline. Each customer can be assigned to a Manager and/or Employee for accountability.
- **Products** — categorized inventory with stock tracking (add/adjust with a full history log), weight and packaging units, low-stock/out-of-stock alerts, and images.
- **Orders** — line items priced live from current product prices, discounts and delivery charges, an append-only payment ledger (supports partial payments and advances), order and delivery status lifecycles with a full tracking history, and printable invoices.
- **Parcel Summary** — a one-click, auto-generated PDF shipping label for any order, pulling customer/order/product data directly from the database (nothing is typed by hand). Shows COD amount, amount due, or Paid depending on the order's actual payment state, plus the business's courier Contract ID / Biller ID, and a bilingual (English + Hindi) return-policy notice.
- **Trash / Recycle Bin** — soft-deleting Customers, Orders, Products, and Employees moves them to an Admin-only Trash with a 10-day recovery window, after which an automatic background job permanently purges them. Permanent deletion is also available immediately, gated behind a typed "DELETE" confirmation.
- **Dashboard** — role-aware overview: today's sales, order/delivery status breakdowns, low-stock warnings, recent orders/customers, and top-selling products.
- **Reports** — permission-gated reporting views for staff who need visibility beyond their own assigned customers/orders.
- **Access control** — Admin / Manager / Employee roles, with granular per-user permission overrides and a "data scope" setting (own records vs. the full team's), so what any given account can see and do is configurable rather than hardcoded to their role alone.
- **Account lifecycle** — public signup requires Admin approval before an account can do anything; Admins can suspend, reactivate, or permanently remove accounts, reassigning their customers/orders in the process.

## Tech stack

**Backend** — Node.js, Express, TypeScript, Prisma ORM 7 (driver-adapter based, no Rust engine) against PostgreSQL (developed against [Neon](https://neon.tech)'s serverless Postgres), JWT auth via HttpOnly cookies, Zod for request validation, bcrypt for password hashing, `express-rate-limit` on auth endpoints, and `pdfkit` for PDF generation.

**Frontend** — React 18, Vite, TypeScript, TanStack Query, React Hook Form + Zod, Tailwind CSS with a Radix UI–based component library, React Router, Sonner for toasts, Lucide for icons, and Motion for animation.

**Structure** — an npm workspaces monorepo (`frontend/`, `backend/`), sharing lint/format config from the root.

## Project layout

```
backend/
  prisma/            schema + migrations
  src/
    routes/api/       Express routes
    controllers/       request/response handling
    services/          business logic
    repositories/       the only layer that touches Prisma
    schemas/            Zod validation
    middleware/          auth, rate limiting, access checks
frontend/
  src/
    pages/              one file per route
    components/          shared UI (incl. a shadcn-style ui/ primitives folder)
    lib/                  API client, auth hooks, misc utilities
```

## Getting started

**Prerequisites:** Node.js 18+, and a PostgreSQL database (a free [Neon](https://neon.tech) project works well).

```bash
# from the repo root — installs both workspace packages
npm run install-all
```

Set up the backend environment:

```bash
cd backend
cp .env.example .env
```

Then edit `backend/.env`:
- `DATABASE_URL` — your Postgres connection string
- `JWT_SECRET` — **required**, the server refuses to start without one. Generate one, don't hand-type it:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `CORS_ORIGIN` — the frontend's origin (`http://localhost:5173` for local dev)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — used once by the seed script to create the first Admin account

Apply the database schema and seed the first Admin account:

```bash
# from backend/
npx prisma migrate deploy
npx prisma generate
npm run seed
```

Run everything:

```bash
# from the repo root
npm run dev              # backend + frontend together
# or, in two separate terminals:
npm run dev:backend
npm run dev:frontend
```

The backend serves on `http://localhost:4000` and the frontend dev server on `http://localhost:5173` by default. Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set above.

## Documentation

This project's build history is tracked in a set of living docs at the repo root:

- **`crm.md`** — the original requirements and data model
- **`phases.md`** — the phase-by-phase build plan (master spec)
- **`PHASE*_TODO.md`** — the curated plan and completion record for each individual phase
- **`about.md`** — a running changelog of everything built, in order
- **`development.md`** — setup notes and development conventions

## License

Private/internal project — not licensed for redistribution.
