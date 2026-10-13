# Phase 31 — Free (₹0) products, and editing an order's discount

**Status: IMPLEMENTED + verified locally (2026-10-13) — committed and pushed to `main` (`221f373`); production check and cleanup complete.**

## Decisions (user, 2026-10-13)

1. ₹0 order → **FREE label** (display only — stored as `PAID`, so payment math, filters
   and reports stay unchanged; no enum change, no migration).
2. Free products → **products priced at ₹0**; they show **FREE** instead of ₹0 in lists/pickers.
3. Edit Pricing permission → **same as Edit Items** (`order:update`, Not Dispatched).
4. New total below the amount already paid → **blocked**.
5. All items in one pass, then one review + test cycle.

(Phase 30 — stock on Trash/Restore/Purge — is a separate plan, still awaiting decisions.)

## The two problems

1. **A product can't be priced at ₹0.** Both ends reject it:
   - backend `backend/src/schemas/product.schema.ts` — `price: z.coerce.number().positive()`
     (create and update)
   - frontend `frontend/src/pages/Products.tsx:370` — `.positive('Price must be positive')`
     (shared by the Add and Edit product dialogs)
2. **An order's discount can't be changed after it's created.** The backend already
   supports it: `updateOrderSchema` has `discount` and `deliveryCharge`, and
   `orderService.update` recalculates the total and logs "Discount updated" /
   "Delivery charge updated" activity. The frontend never sends them, though.
   The order page has only the **Edit Items** dialog (items + quantities), and the
   Discount / Delivery rows in the Order Items card are read-only.

## Problems found nearby (these affect both features)

| # | Issue | Where | Why it matters now |
|---|---|---|---|
| A | **A ₹0 order stays "Unpaid" forever.** `paidStatusFor(0, 0)` returns PENDING, and a payment can't be added (amount must be > 0, and > ₹0 remaining is rejected) | `order.service.ts` `paidStatusFor` | Any order made only of free items with no delivery charge |
| B | **The parcel label for a ₹0 order prints "CASH ON DELIVERY — COD AMOUNT: Rs. 0"** | `parcelSummary.service.ts` (driven by A) | It goes away once A is fixed |
| C | **Editing an order never recalculates payment status.** Paid ₹1000 in full → discount edited to ₹100 → total ₹900, but paid ₹1000 (overpaid). Or discount lowered → total goes up, but status still says PAID | `orderService.update` | This exists today for item edits, and editing the discount makes it far more likely |
| D | **The discount isn't capped.** Discount > subtotal gives a negative total, on both create and edit | `createOrderSchema` / `updateOrderSchema` / `CreateOrder.tsx` | With free items the subtotal can be ₹0, so any discount goes negative |

## Proposed changes

### Part 1 — Free products (₹0 price)

1. **Backend** `product.schema.ts`: `price` → `z.coerce.number().min(0)` for create and
   update. Product price-change activity already handles any number.
2. **Frontend** `Products.tsx`: price → `.min(0, 'Price cannot be negative')`, and add
   `min={0}` to both price inputs.
3. **Display "FREE" instead of "₹0"** where it helps staff: the product list, the product
   pickers in Create Order and Edit Items, and the order item lines. Display only;
   the stored value stays `0`.
4. **Orders:** `resolveOrderItems` already reads the live price, so a ₹0 product
   gives a ₹0 line with no other change. Stock is still deducted and restored exactly
   as for any product. Free items are real goods.
5. **Fix A:** `paidStatusFor` — if `total <= 0` then **PAID** (nothing is owed).
   This also fixes B (the label prints "PAID"). It's applied wherever status is derived:
   create, add/reverse payment, and edit (Part 2).
6. Reports and dashboard: free items count toward quantities/units, add ₹0 to revenue,
   and add ₹0 to inventory value. No change needed; I'll check this during verification.

### Part 2 — Edit discount (and delivery charge) on an existing order

1. **Frontend `OrderDetail.tsx`:** a new **"Edit Pricing"** button (✏️) next to
   Discount/Delivery in the Order Items card. It opens a small dialog:
   - Fields: Discount (₹), Delivery Charge (₹)
   - Live preview: Subtotal − Discount + Delivery = New Total, plus "Paid so far ₹X"
   - Sends `PATCH /orders/:id { discount, deliveryCharge }`, which the existing endpoint
     already accepts
   - **Same gate as Edit Items:** `order:update` permission, order not cancelled,
     delivery status **Not Dispatched** (the backend `assertNotDispatched` already
     enforces this)
2. **Fix D — cap the discount** (backend is the real guard, frontend mirrors it):
   - create: `discount <= subtotal` (subtotal is computed server-side), otherwise 400
     "Discount (₹X) cannot exceed the subtotal (₹Y)"
   - edit: same check against the *new* subtotal. This covers editing items to cheaper
     ones while an old discount stays in place.
   - `CreateOrder.tsx` and the new dialog show the error inline and disable Save
3. **Fix C — keep payment status correct on any edit that changes the total**
   (inside the existing `update` transaction):
   - re-sum payments in the transaction (same pattern as `addPayment`)
   - if **new total < paid so far** → 400 "₹X has already been paid; the new total
     ₹Y would be less than that. Reverse a payment first." Nothing changes.
   - otherwise recalculate with `paidStatusFor(paid, newTotal)`; if the status changed,
     log activity "Payment status updated: PAID → PARTIAL (total changed)"
4. Activity log: "Discount updated ₹old → ₹new" already exists, so it's reused as is.

### Unchanged

Order creation flow, stock rules, the dispatch cut-off, permissions, invoices
(they already show the discount), and per-item discount (`OrderItem.discount`
stays 0; see question 2).

## Verification plan (local Docker DB only, as usual)

- Create a ₹0 product (UI + API); a negative price → rejected.
- Order with a ₹0 product + a paid product → correct subtotal; stock deducted for both.
- Order with only ₹0 items and no delivery → status **Paid**; parcel label says "PAID".
- Edit Pricing: discount 0 → 100 → total drops, activity logged; discount > subtotal →
  400, nothing changes; after dispatch → button hidden and API returns 400.
- Payment status on edit: fully paid then discount up → blocked; part paid then discount
  up so total equals paid → PAID; paid then discount down → PARTIAL.
- Edit Items on a paid order to cheaper items → same total-vs-paid rules apply.
- Regression: create order, reorder, add/reverse payment, cancel, delivery → Returned,
  dashboard/reports/exports with ₹0 lines.
- Production after push: one ₹0 test product + one test order (place → edit discount →
  cancel → Admin trashes order and product), with your approval first.

## Done — what was built

**Backend**
- `product.schema.ts`: price `min(0)` (create + update).
- `order.service.ts`:
  - `paidStatusFor`: `total <= 0` → `PAID`.
  - create: a ₹0 order with no payment is set to `PAID`.
  - `assertDiscountWithinSubtotal` on create, and on edits that change items/discount.
  - update: when the total changes, payments are re-summed inside the transaction.
    A total below paid → 400 (all rolled back, stock included). Otherwise
    `paymentStatus` is re-derived, and activity "Payment status updated (total
    changed)" is logged.
- `parcelSummary.service.ts`: ₹0 order prints **FREE**.
- `orderExport.service.ts`: the Excel export says **Free**; the PDF export prints **FREE**.

**Frontend**
- New `lib/pricing.ts`:
  - `formatPrice` (0 → "FREE")
  - `paymentStatusLabel(status, total)` (₹0 + PAID → "Free"), replacing the two
    duplicated `PAYMENT_STATUS_LABEL` maps
- FREE prices: product detail, global search, Create Order picker + lines,
  Edit Items picker + lines, order item table.
- "Free" status: Orders list badge, Order Detail payments card, Order/Customer Trash detail.
- `Products.tsx`: price must be filled in (the field now starts empty, not 0), so a free
  product is never created by accident. 0 is allowed, negative is not, and inputs have `min=0`.
- `CreateOrder.tsx`: an inline error when the discount is larger than the subtotal; Create is
  disabled while it shows.
- `OrderDetail.tsx`: a new **Edit Pricing** dialog (Discount + Delivery Charge, live new
  total, "Paid so far", inline errors for discount > subtotal and total < paid).
  - Edit Pricing and Edit Items are now both hidden on **cancelled** orders. The server
    already rejected those edits.

## Verification results (local Docker PG `crm-phase31-test`, removed afterwards)

- API script: **44/44 passed**. Covered: ₹0 product create/update, negative price
  rejected, mixed and free-only orders (stock deducted, PAID), free items + delivery →
  Unpaid, discount cap on create/edit (stock rolled back), edit discount/delivery +
  activity, fully paid → edit below paid blocked, discount down → PARTIAL, back → PAID,
  item edit below paid blocked (stock rolled back), unpaid → ₹0 → PAID → back → Unpaid,
  notes-only edit, cancelled-order edit rejected, reorder of a ₹0 order, Excel/PDF exports
  ("Free" in the Excel export), dashboard summary/analytics and all reports return 200.
- Playwright UI: **14/14 passed**. Covered: "Price is required", ₹0 product from the form,
  FREE on product detail and in the picker, "Free" badge on the list/detail, FREE item
  prices, Edit Pricing errors + save, buttons hidden on cancelled orders, paid-order block.
- `tsc` clean in backend + frontend. eslint: no new findings (the
  `CreateOrder.tsx:137` setState-in-effect error was already there on HEAD).

## Notes / follow-ups

- **Pre-push check (2026-10-13, read-only transaction on Neon):** 283 orders, **0** with
  total ≤ 0 and not PAID, so no data fix is needed. No production data was written during
  testing; all tests ran on the local Docker DB.
- Orders that **already** have total ₹0 in production (only possible before this phase
  through discount = subtotal) stay `PENDING` / "Unpaid" until edited. To check whether
  any exist, run this in the Neon SQL editor (read-only):
  `SELECT "orderNumber", total, "paymentStatus" FROM "Order" WHERE total <= 0 AND "paymentStatus" <> 'PAID';`

## Production check (2026-10-13, after push of `221f373`, user-approved)

- Vercel bundle had "Edit Pricing". `/api/health` was OK on Vercel and Render.
- Test records, created as `test@gmail.com` (Employee; it was granted `product:create`
  during the check):
  - product **`P31-TEST-FREE`** (id 43, ₹0, stock 1)
  - customer **"P31 TEST Customer"** (id 253, approved as a third record)
  - order **ORD-2026-000284** (id 286)
- ₹0 product created (201). That proves Render was on the new backend: the old code
  rejects price 0. Negative price → 400.
- UI (browser limited to GET requests): product detail shows FREE with no ₹0;
  Create Order picker shows FREE.
- ₹0 order: total 0, stored `paymentStatus: PAID`; stock 1 → 0; parcel summary 200.
  UI shows "Free" on the order page and in the orders list; the item price shows FREE.
- Edit Pricing:
  - ₹10 discount → 400 "cannot exceed the subtotal"; the dialog shows the error and
    disables Save
  - delivery ₹50 → total 50, PENDING
  - back to ₹0 → PAID
  - activity rows "Delivery charge updated" and "Payment status updated (total
    changed)" written
- Permissions: the button shows for `order:update` on a Not Dispatched order. After
  cancel, Edit Pricing and Edit Items are hidden and the API refuses the edit. It
  returns 403, not 400, because Phase 19 unassigns the Employee once the order is final.
  The route is guarded by `authorize('order:update')`. A user without `order:update`
  wasn't available to test live.
- Cancel → stock back to 1.
- Not covered on production (no payment recorded, to keep the ledger clean): blocking an
  edit below the amount paid. That is covered by the local tests.
- **Cleanup — done (2026-10-13):** the Admin moved order 286, product 43 and customer
  253 to Trash. Verified with GET requests only:
  - none of the three appears in the live order, product or customer lists (searched
    by order number, SKU, name and phone)
  - all three detail endpoints return 404. The order returned 403 before the trash,
    so the 404 confirms it was moved to Trash, not just hidden.
- Production check **complete**.
