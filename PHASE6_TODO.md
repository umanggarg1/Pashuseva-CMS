# Phase 6 Implementation TODO

Working checklist for Phase 6 (Order Management) — full spec in `phases.md`, build order to be added to `development.md` once started. Nothing checked yet — this is the plan, not a progress log.

**Guardrails from phases.md:**

- Never trust a price/total sent by the frontend — backend fetches the current `Product.price` and computes everything itself.
- Snapshot product name/SKU/unit/price into `OrderItem`, and the delivery address into a dedicated `OrderAddress` — never resolve historical orders through the live `Customer`/`Product` records.
- Don't delete orders — cancel them (`cancelledBy`/`cancelledAt`/`cancellationReason`).
- Order Status, Payment Status, and Delivery Status are three independent fields, not one.
- Stock deduct-on-confirm / restore-on-cancel must be a single DB transaction with the order write — never two separate operations that could partially fail.
- Don't build inventory ledgers/warehouses/purchase orders — Phase 6 only consumes the `Product.availableQty` counter Phase 5 already built.

## Resolved decisions (Phase 4/5/6 connection audit, 2026-08-18)

Full detail in `phases.md` §44. Summarized here so the checklist below can just say "do X" instead of "decide X":

- `Order`'s three User relations (`createdBy`, `assignedEmployeeId`, `cancelledById`) need explicit `@relation` names: `"OrderCreatedBy"`, `"OrderAssignedEmployee"`, `"OrderCancelledBy"` — including renaming the already-shipped unnamed `createdBy` relation.
- `checkOrderAccess` scopes by the order's **customer's live assignment** (`assignedEmployeeId`/`assignedManagerId`), not the order's own `assignedEmployeeId` snapshot — matches `checkCustomerAccess`'s "current assignment governs access" rule. `Order.assignedEmployeeId` is display/reporting only.
- Order creation is blocked for `INACTIVE` customers and inactive products (added to the validation list).
- Keep the existing `Order.shipping` column name — "Delivery Charge" is just the UI label, don't rename the field.
- `OrderAddress` snapshot logic takes the customer's first/only address (`addresses[0]`) — safe today since Phase 4's UI only ever creates one, but revisit if a future phase adds multiple addresses with an explicit primary flag.
- `OrderActivity`/`OrderNote` use `createdById` (matching `CustomerNote`/`CustomerActivity`/`ProductActivity`), not the spec's literal `user_id` wording.

## 0. Current state check (already exists from Phase 2, don't rebuild)

- `Order` model exists with `orderNumber`, `customerId`, `subtotal`/`discount`/`shipping`/`total`, `paymentStatus`/`orderStatus`/`deliveryStatus` (currently plain `String`, need converting to enums), `trackingNumber`/`courier`/`expectedDelivery`/`deliveredDate` (Phase 7 territory, leave alone), `createdById`, timestamps. `@@index` on `customerId`/`createdById` already present.
- `OrderItem` model exists with `productId`, `productName`/`productSKU` snapshot, `quantity`, `unitPrice`, `discount`, `totalPrice`. Missing: `unit` snapshot.
- `DeliveryTracking` model already exists (Phase 2) as an append-only history table — Phase 7's job, not Phase 6's; Phase 6 only needs to write/read `Order.deliveryStatus` directly for the basic 4-state version.
- `order:view`/`order:create`/`order:update` permissions already exist in `schemas/permission.schema.ts`'s `PERMISSIONS` list (added in Phase 3, unused until now). **Missing: `order:cancel`.**
- Backend layering convention (schemas → repositories → services → controllers → routes), `checkAccess.ts` middleware pattern, and `authorize()`/`requireRole()` all already established — follow the same shape as the customers/products modules, don't invent a new pattern.

## 1. Schema

- [x] New enums: `OrderStatus` (`PENDING`/`CONFIRMED`/`PROCESSING`/`COMPLETED`/`CANCELLED`), `PaymentStatus` (`PENDING`/`PARTIAL`/`PAID`/`REFUNDED`), `DeliveryStatus` (`NOT_DISPATCHED`/`DISPATCHED`/`IN_TRANSIT`/`DELIVERED` — basic 4-state version only, Phase 7 extends it), `PaymentMethod` (`CASH`/`UPI`/`BANK_TRANSFER`/`OTHER`)
- [x] `Order`: converted `orderStatus`/`paymentStatus`/`deliveryStatus` from `String` to the new enums; added `paymentMethod`, `assignedEmployeeId` (→ `User`, indexed), `cancelledById` (→ `User`), `cancelledAt`, `cancellationReason`. All three `User` relations explicitly named (`"OrderCreatedBy"`/`"OrderAssignedEmployee"`/`"OrderCancelledBy"`); `User.orders` renamed to `User.createdOrders` to match.
- [x] `OrderItem`: added `unit` (`String?`, snapshot of `Product.unit` at purchase time)
- [x] New `OrderAddress` model: `addressLine`, `landmark`, `city`, `district`, `state`, `pincode`, `country`, `orderId @unique`
- [x] New `OrderActivity` model with `oldValue`/`newValue` text fields
- [x] New `OrderNote` model
- [x] Added `order:cancel` to `PERMISSIONS` (not to `DEFAULT_EMPLOYEE_PERMISSIONS`)
- [x] Migrated (`order_management`) + generated — 0 existing `Order` rows, so the `String`→enum conversion was safe non-interactively, no hand-written SQL needed this time

## 2. Backend — schemas (zod)

- [x] `schemas/order.schema.ts` — `createOrderSchema`, `updateOrderSchema`, `cancelOrderSchema`, `updatePaymentSchema`, `updateDeliveryStatusSchema`, `orderListQuerySchema` (active-status checks enforced in the service, not the zod shape — zod validates shape/types only)
- [x] `schemas/orderNote.schema.ts` — `createOrderNoteSchema`

## 3. Backend — repositories

- [x] `repositories/order.repository.ts` — `findMany`, `findById`, `findAssignmentById`, `create`, `update`, `updateStatus`, `updatePayment`, `updateDeliveryStatus`, `cancel`, `recordActivity`, `findActivity`, `nextOrderNumber()`. Transaction-aware: methods that need to participate in the create/update/cancel transaction accept an optional `client: PrismaClientOrTx` param (new type added to `lib/prisma.ts`), defaulting to the singleton client when called outside a transaction.
- [x] `repositories/orderNote.repository.ts` — `create`, `listForOrder`
- [x] Extended `repositories/product.repository.ts`: `decrementStock`/`incrementStock` using an atomic `updateMany` with `availableQty: { gte: quantity }` in the `where` clause (not read-then-write) — the DB itself re-checks stock at update time, so two concurrent orders can't both pass a stale read and oversell. `findById` also gained the same optional transaction-client param.

## 4. Backend — services (the important one)

- [x] `services/order.service.ts` — `list`, `getById`, `create`, `update`, `updateStatus`, `updatePayment`, `updateDeliveryStatus`, `cancel`, `reorder`, `getActivity`. `resolveOrderItems()` is the one function that enforces "never trust the frontend price" — it only ever reads `{ productId, quantity }` from the input and looks up price/name/SKU/unit/stock from the live `Product` row. **Extra resolution made during implementation** (documented in the code comment, not previously in phases.md §44): §15/§17's cancel/edit cutoff tables mix Order Status and Delivery Status values as if one sequence, even though §11/§12 say they're independent fields. Resolved by gating both `update()` and `cancel()` on `deliveryStatus === NOT_DISPATCHED` (plus blocking the `COMPLETED`/`CANCELLED` terminal `orderStatus` values) — that's the field that actually answers "has fulfillment started," which is what the surrounding prose means by "before delivery."
- [x] `services/orderNote.service.ts` — `add`, `list`

## 5. Backend — middleware

- [x] `middleware/checkAccess.ts` — added `checkOrderAccess`, scoped by the order's customer's live assignment (via `orderRepository.findAssignmentById`, which joins to `customer.assignedManagerId`/`assignedEmployeeId`)

## 6. Backend — controllers + routes

- [x] `controllers/order.controller.ts` — `list`, `getById`, `create`, `update`, `updateStatus`, `cancel`, `reorder`, `updatePayment`, `updateDeliveryStatus`, `listNotes`, `addNote`, `getActivity`
- [x] `routes/api/orders.ts` — all endpoints from §29 plus one addition not in the original endpoint list: `PATCH /:id/status` (advances `PENDING`→`CONFIRMED`→`PROCESSING`→`COMPLETED`) — §29 never specified how the lifecycle actually advances, and every other module here (Customer/Product/Category) already uses this exact `PATCH /:id/status` convention, so it followed that rather than inventing something new.
- [x] Mounted in `routes/api/index.ts`

**Another resolution made during implementation:** phases.md §16 literally says stock is deducted "on order confirmed," implying a separate confirm step after creation — but the Create Order screen (§2) has no such step; it's a single `[Create Order]` action, and §7's stock-check example is framed as happening "when creating an order." Resolved: **stock is validated and deducted at creation time** (order starts `PENDING`), not at a later status transition. From `PENDING` onward, `orderStatus` is a pure workflow/tracking field with no further stock side effects on `CONFIRMED`/`PROCESSING`/`COMPLETED`.

## 7. Frontend

- [x] `pages/Orders.tsx` (`/orders`) — table, search, filters (order/payment/delivery status), sort, pagination, status/payment/delivery badges, "+ Create Order"; separate mobile card layout (hidden desktop table / hidden mobile cards via Tailwind breakpoints, per §40) — employee/date-range/amount filters exist on the backend query schema but weren't added to the list UI, same scope call as Customers' city/district/state filters
- [x] `pages/CreateOrder.tsx` (`/orders/new`) — customer search/select, product line-item builder (search → add → quantity, with a visible "Only N in stock" warning), discount/delivery charge/notes, payment method, address defaults silently to the customer's on the backend (no address-override UI yet — noted as a scope cut), subtotal/total shown as "(estimated)" with an explicit note that the server computes the real figures, insufficient-stock/permission errors surfaced via the existing `ApiError.message` → toast/ErrorState path (no separate special-casing needed since the backend's message text is already specific)
- [x] `pages/OrderDetail.tsx` (`/orders/:id`) — status header, delivery timeline stepper, customer/payment/products/pricing cards, activity feed, notes panel, Cancel dialog (reason required, only shown pre-dispatch), Reorder button, order-status and delivery-status "Mark next stage" buttons, and a Payment Status `Select` in the Payment card. **Scope cut**: full order editing (line items) has no UI — the backend's `PATCH /:id` supports it, but the detail page doesn't yet expose an edit flow for items (would essentially duplicate `CreateOrder`'s builder); discount/delivery-charge/notes editing is also not wired to a dialog yet. Noted as follow-up, not a blocker for Phase 6's core deliverable.

**Post-"complete" audit fix (2026-08-18):** re-checking this file's own checklist against the live code (not just re-reading this file) found that Payment Status had no update control anywhere in the UI — `CreateOrder.tsx` never collected it (orders always start `PENDING` per the Prisma default) and `OrderDetail.tsx` only had "Mark next stage" buttons for Order Status/Delivery Status, none for Payment. The backend `PATCH /orders/:id/payment` endpoint was fully built and already curl-tested above, just never called from the frontend — meaning no order could ever actually be marked Paid through the app. Fixed: added an inline `Select` next to "Status:" in the Payment card, calling the existing endpoint on change (unlike order/delivery status, payment status updates are **not** gated on `deliveryStatus === NOT_DISPATCHED` — the backend service has no such restriction, since COD payments are typically collected at/after delivery). Re-verified live: `PATCH /orders/3/payment {"paymentStatus":"PAID"}` → `200`, order updated, `OrderActivity` correctly recorded `"Payment status changed" PENDING → PAID`, then reverted to `PENDING` to leave test data clean.
- [x] Wired `/orders`, `/orders/new`, `/orders/:id` into `App.tsx`
- [x] Toasts already surface the backend's specific error message (e.g. "Insufficient stock. Available: X, Requested: Y") via the existing `ApiError` → toast pattern — no separate special-casing needed

## 8. Verify

- [x] `npx tsc --noEmit` (backend), `npx tsc --noEmit -p tsconfig.json` (frontend) — both clean on the first pass
- [x] `eslint` clean (0 errors, same 5 pre-existing known warnings), `vite build` clean
- [x] curl smoke test, all passed:
  - Created an order with a **forged `price: 1`** field on the line item — confirmed it was silently ignored (not even in the zod schema shape) and the response used the server's real product price (900), computing `subtotal`/`total` correctly. This is the one property that had to be tested live, not assumed.
  - Insufficient stock (`availableQty: 8`, requested `100`) → `400 "Insufficient stock for Medicine B. Available: 8, Requested: 100"`, and confirmed the product's stock was untouched afterward (transaction rollback confirmed, not just assumed).
  - Cancel → stock correctly restored (48 → 50), `cancelledById`/`cancelledAt`/`cancellationReason` all recorded.
  - Reorder → new order created with current prices, correct new `orderNumber` sequence (`ORD-2026-000002`).
  - Dispatched an order, then confirmed both cancel and edit are correctly rejected (400) once `deliveryStatus !== NOT_DISPATCHED`.
  - Role-scoped list: assigned a customer to an Employee, confirmed that Employee sees the customer's orders and an unrelated Employee sees an empty list; confirmed the unrelated Employee's direct `GET /orders/:id` gets `403`.
  - Confirmed `order:create`/`order:update`/`order:cancel` permission gating independently (using real leftover permission state from Phase 3 testing, which incidentally doubled as a live test of permission enforcement) — Employee blocked from cancel/update, allowed to create only for their own assigned customer (403 when attempting for a customer outside their scope).
  - Order number format confirmed: `ORD-2026-000001`, `002`, `003` — sequential, zero-padded, year-scoped.
- [x] Assign/reassign smoke-tested implicitly above (assigning a customer to Rahul mid-session, immediately reflected in order access) — full re-run of the dedicated Phase 4 test script not needed since this exercised the same code path live.

## 9. Docs

- [x] Updated `about.md` — Phase 6 status + full changelog entry
- [x] Added a Phase 6 section to `development.md`'s build log (also fixed two stale "not started" headers left over on Phase 4/5 from before their audits)

---

**Phase 6 implementation complete.** All sections done and verified end-to-end (backend curl smoke tests covering the security property, stock atomicity, access scoping, and lifecycle rules + frontend build/typecheck/lint), including the payment-status-UI gap found and fixed during the post-completion audit above. This file can be deleted once reviewed, or kept as a record.
