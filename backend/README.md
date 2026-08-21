# Backend — CRM

This folder contains the backend scaffold for the CRM application.

Features in this scaffold:

- TypeScript + Express
- Prisma ORM 7 schema for core models (User, Customer, Product, Order, DeliveryTracking, etc.)
- Placeholder health route

Quick start (from `backend/`):

```bash
# install deps
npm install

# generate Prisma client
npx prisma generate

# create a migration and apply (dev)
npx prisma migrate dev --name init

# run dev server
npm run dev
```

Notes:

- Update `.env` with your `DATABASE_URL` and `PORT` before running migrations.
- Replace placeholder code with your application logic as you implement APIs.

Prisma client (v7 — driver adapters)
---------------

This project is on **Prisma ORM 7**, which uses the Rust-free `prisma-client` generator and requires a driver adapter instead of letting the client read the connection URL directly from `schema.prisma`:

- The datasource `url` no longer lives in `schema.prisma`. It's read from `DATABASE_URL` via `prisma.config.ts` (used by Prisma CLI commands like `migrate`/`generate`) and via `@prisma/adapter-pg` at runtime (used by the app).
- The generated client is emitted to `src/generated/prisma` (gitignored) instead of `node_modules/@prisma/client`. Import it from there, not from `@prisma/client`.
- A Prisma client singleton wired to the Postgres adapter is exported from `src/lib/prisma.ts`. Import it in your services or routes:

```ts
import prisma from './lib/prisma';

const user = await prisma.user.findFirst();
```

Make sure to run `npx prisma generate` after changing the schema.

Seeding
-------

To seed initial data (creates an admin user placeholder):

```bash
# from backend/
npm run seed
```

Note: The seed script currently creates a plaintext password for convenience in development — replace with a hashed password before using in any real environment.
