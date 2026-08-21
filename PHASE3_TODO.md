# Phase 3 Implementation TODO

Working checklist for building Phase 3 (Authentication, Authorization, Roles & Permission Management — full spec in `phases.md`, build order in `development.md`). Checked off as work completes in this session.

## 0. Dependency versions

- [x] Check latest versions: `bcrypt`, `jsonwebtoken`, `cookie-parser`, `express-rate-limit` (+ matching `@types/*`)
- [x] Install into `backend/package.json`

## 1. Schema

- [x] Extend `User`: `status`, `managerId` self-relation, `lastLoginAt` (also converted `role` to a `Role` enum, `password` → `passwordHash`)
- [x] Add `UserPermission` model (`userId`, `permission`, `grantedBy`, `@@unique([userId, permission])`, `@@index`)
- [x] Extend `Customer`: `assignedEmployeeId`, `assignedManagerId` (both `@@index`)
- [x] Add `PasswordResetToken` model
- [x] Migration applied (hand-written SQL, since `migrate dev` refuses non-interactive column renames on non-empty tables — see migration `20260818045635_auth_roles_permissions`)
- [x] `npx prisma generate`

## 2. Backend — schemas (zod)

- [x] `schemas/auth.schema.ts` — login, forgotPassword, resetPassword, changePassword
- [x] `schemas/permission.schema.ts` — permission list + defaults (folded `updatePermissionsSchema` in here instead of a separate user.schema.ts entry)
- [x] `schemas/user.schema.ts` — createUser, updateUser, updateStatus, updateRole
- [x] `schemas/customerAssignment.schema.ts` — assign, bulkAssign, reassign

## 3. Backend — repositories

- [x] `repositories/user.repository.ts`
- [x] `repositories/permission.repository.ts`
- [x] `repositories/passwordReset.repository.ts`
- [x] extend `repositories/customer.repository.ts` with assignment methods

## 4. Backend — services

- [x] `services/auth.service.ts` (login incl. bcrypt + status check + lastLoginAt, forgot/reset/change password)
- [x] `services/user.service.ts` (create Manager/Employee, update, status/role changes)
- [x] `services/permission.service.ts` (default grants on Employee creation, replace-permissions)
- [x] extend `services/customer.service.ts` with assign/bulkAssign/reassign

## 5. Backend — auth/session plumbing

- [x] `utils/jwt.ts` (sign/verify helpers)
- [x] `cookie-parser` wired into `app.ts`
- [x] Express `Request` type augmentation for `req.user`

## 6. Backend — middleware

- [x] `middleware/authenticate.ts` (reads HttpOnly cookie, verifies JWT, loads user+permissions)
- [x] `middleware/authorize.ts` (permission-based, Admin/Manager bypass) — plus `requireRole()` for role-gated (non-permission-list) endpoints
- [x] `middleware/checkAccess.ts` (`checkCustomerAccess`, scoped by role)
- [x] `middleware/rateLimiter.ts` (login endpoint)

## 7. Backend — controllers + routes

- [x] `controllers/auth.controller.ts` + `routes/api/auth.ts` (login, logout, me, forgot/reset/change password)
- [x] `controllers/user.controller.ts` + `routes/api/users.ts` (list, create, update, status, role, permissions get/put)
- [x] customer assignment endpoints (assign, bulk-assign, reassign) on the customers module
- [x] protect existing customers routes with authenticate + authorize + checkAccess (also scoped `GET /customers` list by role — Admin/all, Manager/team, Employee/own, per phases.md §20-21)
- [x] mount new routers in `routes/api/index.ts`

## 8. Backend — seed

- [x] `prisma/seed.ts` — bcrypt-hash the admin password, set role/status

## 9. Backend — verify

- [x] `npx tsc --noEmit` (also `eslint backend` clean)
- [x] boot dev server, full curl smoke test: wrong-password 401, correct login sets HttpOnly cookie, `/me` with/without cookie, Admin creates Manager+Employee, default permission grants applied, Manager sees only their team (403 outside it, 403 on Admin-only role change), customer assignment scopes an Employee's visible customers correctly (verified both the positive case and permission-revocation blocking it), logout actually clears the cookie (`Expires` in the past)

## 10. Frontend

- [x] `pages/Login.tsx` (form, password toggle, motion entrance)
- [x] `pages/ForgotPassword.tsx`, `pages/ResetPassword.tsx`
- [x] `lib/auth.ts` — `useCurrentUser()` via `GET /api/auth/me`
- [x] `apiFetch` → `credentials: 'include'` (also handles 204 responses, needed for logout)
- [x] Route guard wrapping protected routes in `App.tsx` (`RequireAuth` + `RequireRole` for `/employees`, nested routing with an `AppShell` layout route so `/login` etc. render standalone without Sidebar/Navbar)
- [x] Permission-aware `Sidebar` nav items + `Navbar` shows current user + logout
- [x] `pages/Employees.tsx` — list, create (Admin: Manager/Employee, Manager: Employee-only), status toggle, permissions dialog, assign/bulk-assign/reassign UI (added `Checkbox`/`Select` ui primitives + `--popover` theme token, both missing before)

## 11. Frontend — verify

- [x] `npx tsc --noEmit -p tsconfig.json`
- [x] `npx vite build`
- [x] `npm run lint` / Prettier clean across the repo (3 pre-existing/expected warnings only, 0 errors)

## 12. Docs

- [x] Update `about.md` — Phase 3 status + changelog entry

---

**Phase 3 implementation complete.** All 12 sections done and verified end-to-end (backend curl smoke test + frontend build/typecheck/lint). This file can be deleted once you've reviewed the work, or kept as a record — it's no longer actively tracked.
