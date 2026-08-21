# Phase 12 — Suppliers & Purchase Management

## Status: DEFERRED (2026-08-20) — not started, do not build until explicitly asked

Spec pasted 2026-08-20. Curated here so the design is preserved for later, but this
phase is intentionally on hold — not needed yet. When it's picked up, re-read this
file first and re-check it against whatever's changed in the meantime, especially the
Phase 8 stock/`StockHistory` code this integrates with directly.

## Why this is the right next module, when the time comes

Phase 8 already handles the *outgoing* side of stock (orders decrement it) and a
manual "Add Stock" for restocking with no formal record of where it came from. This
phase is the *incoming* side done properly: Supplier → Purchase → Stock, with a real
paper trail (who supplied it, at what cost) instead of a bare "New Stock" reason
string. It's a natural extension of Phase 8, not a new independent module — same
shape of decision as Phase 7 keeping delivery on Order Details and Phase 8 keeping
stock on Product.

## Integration points with existing code (for whoever builds this later)

- **`StockHistory` (Phase 8) needs a `purchaseId` nullable FK**, mirroring the
  `orderId` field it already has for order-driven stock changes. A Purchase marked
  Received should write one `StockHistory` row per item (`reason: 'Purchase Received'`,
  positive `change`, linked `purchaseId`), the same pattern order creation/cancellation
  already uses for `orderId`.
- **Selling price vs. purchase price is already structurally safe** — `Product.price`
  (selling price) is a single field orders already trust as the source of truth;
  recording a `purchasePrice` per `PurchaseItem` is a new, separate field on a new
  table, nothing to reconcile or guard against accidentally overwriting.
- **Don't remove or fold in the existing manual "Add Stock" action (Phase 8)** — the
  pasted spec's own §19 draws this distinction deliberately: Purchase is for actual
  supplier deliveries with a paper trail, manual Add Stock stays for miscellaneous
  restocking that doesn't come through a formal purchase (or for businesses that don't
  track suppliers at all). They coexist; Purchase becomes the *preferred* path once
  built, not a replacement.
- **Suppliers reuse the Customer address/phone pattern** — `SupplierPhone`,
  `SupplierAddress` mirroring `CustomerPhone`/`CustomerAddress` (same "one or more
  phones, one primary" and address shape already established), rather than inventing a
  new structure.
- **Reuse the existing product-search-and-line-item-builder UI pattern** from
  `CreateOrder.tsx`/`EditOrderItemsDialog` for the Purchase creation/edit form — same
  debounced product search, same add/remove/quantity-change interaction, just with a
  purchase-price field added per line instead of using the product's selling price.

## Curated scope, for when this is built

### Suppliers (§1, §2, §13, §14)
- `/suppliers` list (search by name/phone/city — same search pattern as
  Customers/Products), `/suppliers/:id` detail page (contact info, address, purchase
  summary, recent purchases list, notes).
- Fields: name*, phones (one or more, one primary), address, notes, status
  (Active/Inactive — **never delete a supplier with purchase history**, deactivate
  instead, exactly like Customer's ACTIVE/INACTIVE rule).

### Purchases (§3, §7, §8, §9, §10, §11, §12)
- `/purchases` list + Create Purchase flow: pick supplier, purchase date, add products
  (search + quantity + purchase price per line), notes, save.
- **Status: Draft → Received → Cancelled.** Stock only changes on the Draft→Received
  transition (one `StockHistory` row per item, linked via `purchaseId`), never on
  Draft edits. This is the important rule from §8/§9 — **stock changes must be tied
  to the Received transition specifically, not to "purchase exists" or "purchase
  edited."** Editing a Draft is unrestricted (add/remove products, change qty/cost);
  editing a Received purchase should be heavily restricted or blocked outright, per
  the spec's own recommendation, to avoid stock inconsistencies.
- Cancelling a purchase that was already Received must reverse the exact stock
  movement that was applied (negative `StockHistory` entries mirroring the positive
  ones, linked to the same purchase) — not a blind "subtract the total again," in case
  the purchase was partially adjusted first.
- Purchase Details page mirrors Order Details' structure (header, supplier card,
  products table, total, stock-impact section, notes) — same visual language as the
  rest of the app, not a new pattern.

### Purchase history on Product Details (§6)
- A "Purchase History" section on `ProductDetail.tsx` (date, supplier, qty, cost per
  purchase) — distinct from the existing Stock History section (Phase 8), which stays
  as the append-only "every stock-affecting event" log; Purchase History is a
  purchase-specific view filtered/joined from the same underlying data.

### Dashboard/summary (§16, §18)
- A small "This Month / Purchases / Products Received / Pending (Draft)" stat strip on
  a Purchases page, and optionally a small "Recent Purchases" card on the main
  Dashboard — only if genuinely useful, matching the spec's own "don't build a huge
  purchasing dashboard" caution.

### Permissions (§15)
New permissions needed: `supplier:view`, `supplier:create`, `supplier:update`,
`purchase:create`, `purchase:update`, `purchase:cancel`. Not added to
`DEFAULT_EMPLOYEE_PERMISSIONS` (Employee default is ❌ across the board per the
spec's own table) — Manager gets `purchase:create` by default per the spec, the rest
"depends," matching how granular permissions are already granted case-by-case via the
Employees page.

## Explicitly not doing (per the spec's own instruction)

**No Accounts Payable / supplier credit / payment tracking** — no "amount owed,"
"amount paid," "remaining balance," "payment schedule," or "credit period." Get
Supplier → Purchase → Stock solid first; supplier payments would be its own focused
future phase if the business actually needs it, not folded into this one. Also no
purchase-price analytics/trends beyond the simple chronological Purchase History list
(§6) — no "average cost over time" charts or forecasting.
