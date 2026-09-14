# Phase 7 — Delivery Tracking & Status Management (Final)

Curated from a pasted "Final Phase 7" spec (2026-08-19). Cross-checked against what's
already built (the "Order Details Redesign & Delivery Tracking History" work, plus the
"manual status selection" pass done immediately before this). Nothing below deletes or
replaces existing delivery data — `Order.deliveryStatus` and the `DeliveryTracking`
table stay exactly as they are; every item here is additive or a permission/UX fix.

**Process note:** todo items are implemented one at a time, only after the user
explicitly says to start that item. Do not build ahead.

## Already satisfied — no action needed

The spec's core architectural stance is "no separate Delivery module, everything lives
on Order Details" — that's already how this app is built, not a new direction:

- No `/deliveries` route, no Delivery table, no Delivery nav item. Order Details
  (`/orders/:orderNumber`) is the only place delivery is managed.
- `DeliveryTracking` (orderId, status, location, note, updatedById, createdAt) is
  already the append-only "don't overwrite, keep history" table the spec calls
  `order_delivery_history` — same shape, no rename needed.
- Delivery Timeline showing full ordered history (status + location + time + who) is
  already rendered on Order Details from `GET /orders/:id/tracking`.
- Manual status selection (any of NOT_DISPATCHED/DISPATCHED/IN_TRANSIT/DELIVERED, any
  direction, repeatable) already shipped in the previous pass — covers "transit can be
  logged two or more times" and "user can revert back."
- Per-status location field with contextual label (`STATUS_FIELD_CONFIG` — "Dispatch
  Location" / "Current Location" / "Delivered At") already exists in
  `ChangeDeliveryStatusDialog`.

## Status: items 1-3 done (2026-08-19), item 4 skipped by design

## Curated todo — genuinely new/useful

1. **DONE — separate "Add Location Update" action.** `AddLocationUpdateDialog` in
   `OrderDetail.tsx`, shown next to "Change Status" only when `deliveryStatus ===
   'IN_TRANSIT'`. Location + Note only, posts to the same `PATCH
   /orders/:id/delivery-status` with `deliveryStatus` held at `IN_TRANSIT`. No schema
   change, as planned.

2. **DONE — "Received By" field for DELIVERED.** Went with option (b): added a real
   `receivedBy` column on `DeliveryTracking` (migration
   `20260819124807_add_delivery_received_by`), a dedicated input shown only when the
   picked status is DELIVERED, and it now renders on the timeline entry.

3. **DONE — permission gating reconciled.** `PATCH /orders/:id/delivery-status` and the
   frontend's delivery-status controls (Change Status + Add Location Update) now both
   require `delivery:update` instead of `order:update`. Kept a single `delivery:update`
   permission covering both actions rather than splitting into
   `delivery:update_status`/`delivery:add_location` — no signal the user wanted that
   extra granularity, and one permission already does the job the spec was after
   (letting a Manager grant delivery-status rights independently of order-edit rights).

4. **SKIPPED — manual date/time entry for backdating.** Left as server-generated
   `createdAt` only; no override field added. Revisit if a real backdating need shows up.

## Explicitly not doing

- No separate Delivery table, delivery number, delivery partner, or proof-of-delivery
  attachment system — that was the earlier, fully-reverted Phase 7 module and is out of
  scope here by design.
- No renaming `DeliveryTracking` to `order_delivery_history` — same structure already,
  renaming is churn with no functional benefit.

## Addendum, 2026-08-20 — Article Number & Estimated Delivery Charges

**DONE.** Two optional fields added to `Order`, requested directly ("Add both fields
to Phase 7/Order Management"), not curated-then-deferred like the rest of this file —
implemented and verified the same session.

- **Article Number** — the courier-provided tracking/reference number. **Reused the
  existing unused `trackingNumber` column** (present on `Order` since the original
  Phase 6 schema, confirmed via a full codebase grep to be referenced by zero
  repository/service/controller/frontend code, and confirmed via the live database
  that 0 of 10 existing orders had it set) rather than adding a new column —
  semantically the same field, just renamed to `articleNumber` and finally wired up.
  Labeled **"Article Number (Tracking No.)"** everywhere it's shown, per explicit
  request, so the two names are visibly tied together. `courier` (the other unused
  sibling column from the same original schema) stays unused — out of scope here.
- **Estimated Delivery Charges** — a new nullable `Float` column (matching every other
  money field on `Order` — `subtotal`/`discount`/`shipping`/`total` are all `Float`;
  deliberately did **not** use `Decimal` as the spec suggested, since introducing it
  for one sibling field alone would mean different serialization/type handling for no
  practical benefit at this app's scale — flagged as a judgment call, not a silent
  override). **Verified live that it never enters the `total` calculation** — `total =
  subtotal - discount + shipping` (unchanged), confirmed via a real order where
  `estimatedDeliveryCharges: 180` left `total` at exactly `subtotal + shipping`.
- Both fields: optional at creation, editable afterward (inline edit UI on the
  Delivery card, same pattern as Expected Delivery Date), and **empty-string input
  normalizes to an explicit `null`** on save (not `0` for the charge field — a real
  edge case caught and fixed: converting the input to `Number()` client-side before
  sending would have turned "cleared" into "₹0", so the raw string is sent and the
  backend's `zod` preprocessing handles the null-vs-untouched distinction). A PATCH
  that omits the field entirely leaves the stored value untouched (Prisma ignores
  `undefined`); explicitly sending an empty value clears it to `null`.
- Migration `20260820072943_order_article_number_and_delivery_charges` (a
  drop-and-add, not a true rename, since Prisma doesn't detect column renames from a
  field-name change alone — safe because no data existed in the old column).
- Shown in `CreateOrder.tsx`'s new "Delivery Information" section and in
  `OrderDetail.tsx`'s Delivery card; **deliberately left off the printable order
  view** (`PrintableOrder`) for Estimated Delivery Charges specifically — that view is
  customer-facing and the field is explicitly internal-reference-only, so surfacing it
  there would risk a customer misreading it as an extra charge on top of the total.
  Article Number *is* shown on the printable view (a tracking number is normal to
  hand a customer).
- Activity log records both fields changing (`"Article number changed"` /
  `"Estimated delivery charges changed"`, old → new), matching every other tracked
  order field.

Live-verified end to end: create with both fields set, total unaffected; edit each
field independently; clear each to `null` via empty input (not `0`/`""`); patch an
unrelated field (discount) and confirm articleNumber/estimatedDeliveryCharges stay
untouched; activity log entries correct for every change. Test order cancelled
afterward. `tsc --noEmit`/`eslint` clean on both packages (0 errors, same
pre-existing warnings), `vite build` clean.

## Addendum, 2026-09-14 — Article No. click-to-copy-and-track (India Post)

**Status: IMPLEMENTED, `tsc --noEmit` clean. Not yet browser-verified or
committed (user asked not to commit/push this session).** Frontend-only, no
backend/DB involvement.

### Request, as given

On the Orders page, clicking the Article No. should:
1. Copy the Article Number to the clipboard (browser Clipboard API — e.g. `EW123456789IN`).
2. Open the India Post Track & Trace website in a new tab.
3. Show a small success toast, e.g. *"Article number copied. Opening India Post..."*

User flow (manual from there — no automation):
```
Click Article No. -> Copy Article No. -> Open India Post in new tab
  -> Paste Article No. -> Enter CAPTCHA -> Search
```

Explicit constraints: no India Post API integration, no database changes, no
delivery-status changes, no Orders table/layout changes, no scraping or automatic
interaction with the India Post site, Article Number stored/displayed exactly as
today.

### Where Article No. actually appears (checked before planning)

- **Orders list page** (`Orders.tsx`) — the one named in the request:
  - Desktop table cell, currently plain text: `order.articleNumber ?? '—'`
    ([Orders.tsx:335-337](frontend/src/pages/Orders.tsx#L335-L337)).
  - Mobile card, currently plain text, only rendered when set:
    `Article No: {order.articleNumber}` ([Orders.tsx:377-381](frontend/src/pages/Orders.tsx#L377-L381))
    — **this line sits inside the card's own outer `<Link to=".../orders/:id">`**,
    so a click handler here needs `preventDefault`/`stopPropagation` or it will
    also navigate to Order Detail.
  - Neither cell has any click handler today — safe to add one without conflicting
    with existing behavior on this page.
- **Order Detail page** (`OrderDetail.tsx`), NOT named in the request, found while
  scoping — two more places the same text shows:
  - The Delivery card's editable field: `Article Number (Tracking No.): {value}`
    plus a separate small pencil icon button that opens inline-edit
    ([OrderDetail.tsx:948-963](frontend/src/pages/OrderDetail.tsx#L948-L963)). The
    text itself has no click handler today — only the pencil icon does — so adding
    copy+track to the text would not conflict with editing.
  - The printable/receipt view: `<p>Article Number (Tracking No.): {order.articleNumber}</p>`
    ([OrderDetail.tsx:730](frontend/src/pages/OrderDetail.tsx#L730)) — this is the
    printed document shown to/for the customer, not an interactive page element.
    **Proposed: leave this one alone regardless of the answer below** — a printed
    page has no "click" and no clipboard.

### Questions — answered

1. **URL**: user said to search for it — initially confirmed via web search as the
   official India Post consignment-tracking page
   (`.../dop.portal.tracking/trackconsignment.aspx`), then **revised by explicit
   instruction to the India Post homepage**: `https://www.indiapost.gov.in/`.
2. **Scope**: Orders list **+ Order Detail**. The printable/receipt line
   ([OrderDetail.tsx:730](frontend/src/pages/OrderDetail.tsx#L730)) stays untouched
   as proposed — no interactivity on a printed document.
3. **Desktop vs mobile**: **both**.
4. **Visual affordance**: minimal cue added — `text-primary` + `hover:underline` +
   `cursor-pointer` on the article number text itself only, no column width/spacing
   change.

### Defaults I'll apply unless told otherwise (stated, not asked)

- No article number (`'—'` shown) stays fully inert — no copy, no new tab, no
  click handler attached at all.
- Toast text used verbatim: *"Article number copied. Opening India Post..."*
  (`toast.success(...)`, the `sonner` pattern already used throughout
  `OrderDetail.tsx`).
- Implementation order inside the click handler: call `window.open(url, '_blank')`
  **synchronously first**, then `navigator.clipboard.writeText(...)` — calling
  `window.open` after an `await` risks some browsers' popup blocker treating it as
  no longer inside the original user gesture. The user-visible result (copy done,
  tab opened, toast shown) is the same either way — this only affects internal
  call order, not behavior described in the request.
- If `navigator.clipboard.writeText` rejects (e.g. permissions denied) the new tab
  still opens (tracking still needs to work), and the toast/console reflects the
  copy failure rather than silently claiming success.
- No India Post API call, no `fetch` to their site, no autofill of the tracking
  number into their search box, no scraping — the new tab opens to the bare
  tracking page only, exactly as the request's manual flow describes.

### TODO checklist

- [x] India Post URL confirmed via web search (question 1).
- [x] Questions 2-4 answered by the user.
- [x] New `frontend/src/lib/articleTracking.ts`: `INDIA_POST_TRACKING_URL` +
      `openArticleNumberTracking(articleNumber)` — opens the tab first
      (synchronously, within the click gesture), then copies to the clipboard;
      toast on success, a different toast if the clipboard write rejects; tab
      still opens either way.
- [x] `Orders.tsx` desktop table cell: article number wrapped in a
      `role="button"` span (click + Enter/Space) calling the shared handler when
      set, stays plain `—` text when not.
- [x] `Orders.tsx` mobile card: same, plus `preventDefault`/`stopPropagation`
      since this line sits inside the card's own outer `<Link>` to Order Detail
      — confirmed the card still navigates normally when clicking anywhere else.
- [x] `OrderDetail.tsx` Delivery card's editable field: the read-only article
      number text (not the separate pencil-icon edit button) gets the same
      handler; edit flow (`setEditingArticleNumber`) untouched, still a sibling
      element.
- [x] Printable/receipt line ([OrderDetail.tsx:730](frontend/src/pages/OrderDetail.tsx#L730))
      deliberately left as plain text, per question 2's answer.
- [x] `tsc --noEmit` clean (frontend).
- [ ] Manual browser verification (clipboard actually receives the value, new tab
      opens to the confirmed URL, toast text matches, existing Order Detail
      navigation/edit behavior unaffected) — not yet done.
- [ ] Not committed — user asked not to commit/push this session.
