# Phase 8 — Inventory & Stock Management

Spec pasted 2026-08-19. No separate inventory module — stock stays a property of
`Product`, managed from Products / Product Details, and orders already move stock
automatically (checked against the existing order flow below).

## Already in place — no action needed

- `Product.availableQty`, `Product.minimumStock`, `Product.unit` already exist.
- Orders already move stock automatically: `resolveOrderItems` decrements stock at
  order creation (atomic, race-safe `updateMany` guard against overselling), `cancel`
  and item-edit both increment it back. This is a simpler version of the spec's
  "Reserved → Dispatched → Reduced" flow (see decision below).
- `GET /products?stock=low|out` already exists (`productService.list`), and low/out
  filtering is already wired into the Products page filter bar.
- `ProductActivity` already logs price/stock/status changes on the generic edit form.

## Decision: no separate "Reserved" stock state

The spec's §8-9 describes `Stock → Reserved → Reduced-on-dispatch`. The app already
decrements `availableQty` at order creation and restores it on cancel/edit, which
already guarantees stock can't be oversold — the same guarantee the Reserved state
exists to provide, without an extra column or a second stock-transition path tied to
delivery status. Keeping the existing model; not introducing `reservedQty`.

## Status: all items done (2026-08-19)

### Backend

1. **DONE** — `StockHistory` model added (`productId, change, reason, note?, orderId?,
   createdById?, createdAt`), migration `20260819125228_add_stock_history`.
2. **DONE** — `productRepository.recordStockHistory/addStock/adjustStock/findStockHistory`
   added; `adjustStock` guarded via `updateMany` so it can never take stock below 0.
   Wired into all three order-driven stock touch points (create, item-edit, cancel) —
   each now writes a matching `StockHistory` row (`Order Placed` / `Order Items Updated`
   / `Order Cancelled`) linked to the order.
3. **DONE** — `addStockSchema`/`adjustStockSchema`, reason required on both.
4. **DONE** — `POST /products/:id/stock/add`, `POST /products/:id/stock/adjust`,
   `GET /products/:id/stock-history`.
5. **DONE** — `stock:add`/`stock:adjust` added to `PERMISSIONS`, the two new routes use
   `authorize(...)` (ADMIN/MANAGER bypass, EMPLOYEE needs the explicit grant) instead of
   the `requireRole('ADMIN','MANAGER')` the rest of Products uses. Not added to
   `DEFAULT_EMPLOYEE_PERMISSIONS`.
6. **DONE** — product search now also matches category name.

### Frontend

7. **DONE** — Products list shows quantity + a separate 🟢/🟠/🔴 Stock Status column.
8. **DONE** — Product Details Stock card with Current/Minimum/Status plus
   `AddStockDialog`/`AdjustStockDialog`, each gated on `stock:add`/`stock:adjust`.
9. **DONE** — Stock History list on Product Details, newest first, shows delta, reason
   (or `Order #...` when order-linked), note, date, and who made the change.
10. **DONE** — Unit is now a `Select` from the fixed 7-option list in both Add/Edit
    Product dialogs.
11. **DONE** — Home/Dashboard now has a real Low Stock / Out of Stock alert widget
    (reuses `GET /products?stock=low|out`), each row linking to the product, plus a
    "View Products" link.
12. **DONE** — Employees permission UI has "Add Stock"/"Adjust Stock" rows under
    Products.

### Verified

Backend `tsc`/`eslint` clean, frontend `tsc`/`eslint`/`vite build` clean. Live-tested
against the real DB: add stock, adjust stock (including the below-zero guard rejecting
correctly), stock history (including order-linked rows), low/out-of-stock filters, and
category-name search all behaved as expected. Test data was reset back to its original
state afterward.

## Explicitly not doing

Per spec §14: no warehouses, batches, expiry tracking, suppliers, purchase orders,
stock forecasting, or a dedicated inventory analytics dashboard.
