# Phase 10 — Notifications & Communication

## Status: DEFERRED (2026-08-20) — not started, do not build until explicitly asked

Spec pasted 2026-08-20. Curated here so the design decisions aren't lost, but this
phase is intentionally on hold — the CRM doesn't need a notification system yet, and
building one now would be complexity without a corresponding need. The next phase to
actually build is "Customers & Orders Advanced Features" (see `about.md`'s "Next
recommended work"), not this one.

When this phase is picked up later, re-read this file first — don't re-derive the
scope from scratch, and re-check it against whatever's been built in the meantime
(the assignment/scoping patterns this leans on may have evolved).

## Curated scope, for when this is built

### 1. Notification Center
- 🔔 bell icon in `Navbar` with an unread-count badge, a dropdown (few most recent,
  unread indicator, "View All"), and a full `/notifications` page with All/Unread
  tabs.
- Mark as read (single) and Mark all as read.

### 2. Notification types (only these — resist adding more)
- Orders: created, assigned, order status changed, delivery status changed, cancelled.
- Customers: assigned to an employee, new customer created (where relevant to the
  recipient).
- Stock: low stock, out of stock.
- Employee: customer assigned, order assigned, permission changed.

### 3. Role/assignment-aware delivery
No new scoping logic needed — reuse the exact same role/assignment scope already
used everywhere else in this app (Admin sees everything, Manager sees their team,
Employee sees only what's assigned to them; see `dashboard.service.ts`'s
`orderScope`/`customerScope` for the established pattern). A notification is created
for whichever users that event's scope includes.

### 4. Click-through
Every notification carries `entityType`/`entityId`; clicking routes straight to the
relevant page — `ORDER` → `/orders/:orderNumber`, `PRODUCT` → `/products/:id`,
`CUSTOMER` → `/customers/:id`. This is the part of the spec that actually makes
notifications worth building — a notification that doesn't take you anywhere isn't
much better than the existing Activity feed.

### 5. Database
One simple model, matching the spec exactly:
```
Notification: id, userId, type, title, message, isRead, entityType, entityId, createdAt
```

### 6. Delivery mechanism: DB + polling, not WebSockets
Frontend polls (e.g. every 30-60s) rather than any push mechanism. No
WebSockets/Socket.IO/SSE in this phase — explicitly deferred further, per the spec's
own guidance.

### 7. Duplicate prevention
Notifications are created at the exact point the triggering event happens in the
service layer (order status change, assignment change, etc.), never derived from
what the frontend happens to have loaded. For low stock specifically: fire only on
the threshold *crossing* (previous `availableQty >= minimumStock` and new
`availableQty < minimumStock`), not on every subsequent decrement while already
below minimum — otherwise one slow-selling low-stock product spams a notification
per order.

### 8. Activity vs. Notification stay separate
`OrderActivity`/`CustomerActivity`/`ProductActivity` (already built, already the full
audit trail) are not touched or duplicated. `Notification` is a smaller, separate
"you should look at this" subset — not every activity becomes a notification.

### 9. Email — only if/when it's actually wired up
**Prerequisite this phase doesn't currently have**: no email provider is configured
anywhere in this app — Phase 3's password reset already logs its token instead of
emailing it (see `about.md`'s Phase 3 "Known simplifications"). Real email
notifications in Phase 10 means wiring up a real provider first, a genuine infra
dependency (SMTP credentials or a service like SendGrid), not just app code. Scope,
if built: password reset (finally sent for real) and a few important order events
(confirmed/dispatched/delivered) — only for customers whose record actually has an
email, never invented for phone-only customers.

### 10. Call/WhatsApp customer actions
`tel:`/`https://wa.me/` device links next to every phone number shown (Customer
Detail, Order Detail) — no provider API, no backend change, genuinely simple. Note:
this specific item needs none of the rest of Phase 10's infrastructure (no
Notification table, no polling) — it could be pulled forward and built standalone if
ever wanted before the rest of this phase, but stays deferred with everything else
per the "we don't need this yet" call.

### 11. Notification preferences
Simple checkboxes in Settings (which event types to receive), scoped to what's
relevant to the viewer's role. Small addition once the rest of this phase exists —
not worth building in isolation first.

## Explicitly not doing (per the spec's own list, still true whenever this is picked up)

Full WhatsApp Business API integration, an SMS provider, bulk/marketing messaging,
push notifications, WebSockets, complex notification rules, notification analytics,
an email campaign system.
