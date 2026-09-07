# Phase 21 — Orders Export (Download Orders with Filters)

**Status: plan only, per instruction — nothing implemented yet.**

A "Download Orders" action on the Orders page, opening a filter panel/modal (the
existing Orders page and its table are explicitly untouched), producing an Excel
(.xlsx) or PDF file of orders matching Date + Payment Status + Area + Delivery
Status — all defaulting to "All"/no restriction, filters combining with AND. A
live "N orders found" count previews the result before downloading.

## The request, as given (latest revision — supersedes the earlier CSV-based draft)

Modal, triggered by a new "Download Orders" button (Orders page unchanged
otherwise):

```
Download Orders
────────────────────────────

Date
○ Today  ○ Yesterday  ○ Last 7 days  ○ This month  ○ Last month  ○ Custom
  From: [ DD/MM/YYYY ]   To: [ DD/MM/YYYY ]

Payment Status
○ All   ○ Paid   ○ Unpaid

Area
○ All   ○ Select Area...

Delivery Status
○ All   ○ Delivered   ○ Undelivered

────────────────────────────
42 orders found
────────────────────────────
       [ Cancel ]   [ Download Excel ]   [ Download PDF ]
```

Exported columns (both formats): `Order | Date | Customer | Phone | Area |
Article No. | Items | Amount | Payment | Delivery` — one row per order, order
items readable in a single cell (`Cow Feed × 2, Jadi Boti × 1`) and, per the
PDF requirement specifically, **each order stays on one line** — no wrapping.

**Two formats, not three** — this revises the earlier draft's "Excel and/or
CSV" down to **Excel (.xlsx) and PDF**, dropping CSV entirely:
- **Excel** — for managing/filtering/sorting the data further (sortable ₹
  amounts, sortable dates, real cells).
- **PDF** — for printing/sharing as a fixed, presentable report. A4 landscape,
  one line per order, plus a summary header block (see below) that Excel
  intentionally doesn't get (mixing summary rows into a sortable/filterable
  data table would defeat the point of the Excel format).

**PDF summary header**, above the order table, generated from the same
filtered result set (not a separate query):

```
PASHUSEVA – ORDER REPORT

01/09/2026 – 08/09/2026
Area: Gurugram | Payment: Unpaid | Delivery: Undelivered

Orders: 42       Total Amount: ₹38,450
Paid: ₹0         Unpaid: ₹38,450
```

The filter-summary line only lists filters that are actually restricted (not
"All") — e.g. an unfiltered export shows just the date range, no
Area/Payment/Delivery line at all, rather than printing "Area: All | Payment:
All | Delivery: All" every time.

Filters combine (AND): e.g. Date 1–8 Sep + Unpaid + Area "Gurugram" +
Undelivered → only orders matching all four. Confirmed final filter set is
exactly Date/Payment/Area/Delivery — deliberately not adding more, per
instruction, so the popup stays simple.

## Design decisions that need resolving before/at implementation

1. **`dateTo` must be end-of-day inclusive, not reused as-is.** Checked the
   existing `orderListQuerySchema`/`buildOrderWhere` (`order.service.ts:210`) —
   today's regular Orders list already accepts `dateFrom`/`dateTo`, but applies
   `dateTo` as a raw `lte` on whatever `Date` value is parsed. If the frontend
   sends a bare date string, `z.coerce.date()` parses it as `00:00:00`, so "To:
   08/09" would **exclude every order placed on the 8th** — exactly the bug the
   original request called out wanting to avoid. The export's shared
   where-builder (see decision #9) must normalize `to` to `23:59:59.999` on
   that date (`dateFrom` at `00:00:00`). Worth deciding separately (not
   silently, since it changes existing behavior) whether the *existing*
   `/orders` list filter has the same bug and should be fixed too — noted
   here, not assumed in scope.
2. **"Unpaid" needs an explicit mapping**, since `Order.paymentStatus` is a
   4-value enum (`PENDING`/`PARTIAL`/`PAID`/`REFUNDED`), not binary. The app's
   own established convention elsewhere (`dashboard.service.ts`'s comment: "PENDING
   here means nothing paid yet — Cash on Delivery until proven otherwise") maps
   `PENDING` → COD/Unpaid for display. Proposed: `Payment=Unpaid` matches
   `paymentStatus IN (PENDING, PARTIAL)` (anything not fully paid), `Payment=Paid`
   matches `PAID` only. `REFUNDED` orders would fall under neither Paid nor
   Unpaid as this table doesn't have a slot for them — needs a decision: fold
   into Unpaid, or exclude from both filters when a specific one is chosen (only
   appear under "All")? Recommend the latter (excluded from both Paid/Unpaid,
   visible only under All) unless told otherwise. **Also feeds the PDF summary's
   Paid/Unpaid totals** — same mapping must be used for both the filter and the
   summary math, or the two could disagree on a REFUNDED order.
3. **"Undelivered" is `deliveryStatus != DELIVERED`, not a second enum value** —
   the real column has 10 states (`NOT_DISPATCHED`, `DISPATCHED`, `IN_TRANSIT`,
   `OUT_FOR_DELIVERY`, `DELIVERED`, `RETURN_PENDING`, `RETURN_IN_TRANSIT`,
   `RETURNED`, `LOST`, `DAMAGED`). Proposed: `Delivered` → `deliveryStatus =
   DELIVERED`; `Undelivered` → everything else. Flagging in case "Undelivered"
   was meant to exclude terminal-but-not-delivered outcomes (`RETURNED`/`LOST`/
   `DAMAGED`) rather than lump them in — reasonable default either way, but a
   real choice.
4. **"Area" needs a concrete field, and must be a dropdown sourced from real
   data, not free text** (explicitly requested — don't make the user type it).
   Nothing in the schema is literally called "Area" — the closest existing
   data is the customer's address (`district`/`city`/`state`, e.g.
   `district: "NUH"`, `state: "HARYANA"`). The spec's own examples ("Area:
   Gurugram"/"Gurgaon") read as district-level values. Proposed: bind "Area" to
   `Customer.address.district`, and populate "Select Area..." from the
   distinct district values already in use (new lightweight endpoint, e.g.
   `GET /api/customers/districts`, or derive client-side if a customer list is
   already loaded somewhere convenient) — needs confirming before building the
   picklist, since city/state are equally plausible reads and the underlying
   data is free-text (inconsistent casing/whitespace/typos observed in real
   records, e.g. "CHINDDWWRA", "BHONDSI ") which will need at least a `trim()`
   + case-insensitive group-by to produce a usable dropdown rather than dozens
   of near-duplicate entries.
5. **File generation libraries**: Excel needs a new dependency (`exceljs` —
   backend currently has no `.xlsx` library). **PDF needs no new dependency** —
   `pdfkit` is already in `backend/package.json` (used for the existing
   parcel-summary PDF), and the same library can produce the orders-report PDF.
6. **This deliberately departs from Phase 9's "no backend export endpoint"
   precedent** (`frontend/src/lib/exportCsv.ts`'s own comment: reports export
   client-side because the filtered rows are already in memory). That doesn't
   hold here — the export's date range/filters are independent of whatever page
   of the Orders list happens to be on screen, and could span far more rows
   than any single fetched page. A real backend endpoint is the right call
   this time, not an inconsistency with Phase 9's choice.
7. **Response delivery mechanism**: each format endpoint returns the file
   directly (`Content-Disposition: attachment`, correct `Content-Type`) rather
   than a JSON body. **Given the "Generating report…" requirement**: a bare
   `<a href>`/`window.open` navigation (the *existing, separate* per-order
   parcel-summary PDF button's current pattern — not to be confused with this
   feature's new orders-report PDF) gives the app no JS-visible signal of when
   generation finishes, so it can't drive a loading state. To show "Generating
   report…" and dismiss it exactly when the file is ready, the frontend needs
   a real `fetch(..., { credentials: 'include' })` for the blob, then a
   synthetic `<a>` click to save it — the same blob-download shape
   `frontend/src/lib/exportCsv.ts` already uses, just fetching the blob from
   the server instead of building it client-side.
8. **Permission gating**: proposed `authorize('order:view')` on every new
   route (count + both export formats) — it's exporting/counting the same rows
   a user could already see via the normal Orders list, just more of them at
   once and in a file. Data scope (`orderDataWhere`/`buildOrderWhere`) applies
   identically, so an Employee only ever exports their own assigned orders, a
   Manager their team's, matching today's list behavior exactly.
9. **A single shared where-builder function backs the count preview and both
   export formats — this is load-bearing, not a nice-to-have.** If "42 orders
   found" were computed by logic even slightly different from what the actual
   Excel/PDF generation uses, the count shown to the user could silently
   disagree with what they actually download, which is worse than not showing
   a count at all. Proposed: one `buildOrderExportWhere(actingUser, filters)`
   in `order.service.ts`, used by `count()`, `exportExcel()`, and `exportPdf()`
   alike.
10. **Order-count preview is a live, debounced query** as the user changes
    filters in the dialog (not just computed once on open) — a lightweight
    `GET /api/orders/export/count?...` (same query shape as the export
    endpoints, reusing decision #9's shared where-builder) returning just
    `{ count }`. Debounce on every filter change (~300ms), same pattern as
    existing debounced-search inputs elsewhere in the app
    (`useDebouncedValue`).
11. **Confirmed: backend-generated, not client-side** — the database query
    does the filtering (PostgreSQL, indexed on `orderDate`/the status
    columns), the backend builds the file, the browser only downloads the
    finished result. Never load every matching order into the browser and
    build the file there — slower and unnecessary memory for what could be
    thousands of rows. Expected timing at this app's scale: sub-second for
    ~100 orders, low seconds even at 10,000+ — the query itself is the only
    part that could meaningfully vary with volume, and a well-indexed
    date-range query stays fast well past this app's realistic order volume.
    No pagination/streaming needed for now — revisit only if real volume ever
    approaches tens of thousands of orders in a single export.
12. **Excel print/page layout** (Excel only — see decision #13 for PDF's
    equivalent, a different mechanism entirely):
    - Page setup: A4, landscape, narrow margins, "fit to 1 page wide" (height
      unconstrained — let rows flow onto additional pages).
    - Repeat the header row on every printed page (`ws.pageSetup.printTitlesRow`
      in `exceljs`, sets the underlying `$1:$1` repeat-rows print area).
    - Freeze the header row on-screen too (`ws.views = [{ state: 'frozen',
      ySplit: 1 }]`), independent of the print-repeat setting above but usually
      wanted together.
    - Compact row height + compact font (something like 9–10pt) so a 10-column
      row realistically fits landscape width without wrapping — worth a quick
      manual check once real column content (longest customer name, longest
      Order Items cell) is known, rather than guessing a font size that turns
      out too large for the widest realistic row.
    - Amount column: real Excel number format with ₹ (`'₹'#,##0.00` via
      `cell.numFmt`), not a pre-formatted string — keeps it sortable/summable
      in Excel, one of the original reasons for offering Excel at all.
    - Date column: `DD/MM/YYYY` cell format (`cell.numFmt = 'dd/mm/yyyy'` on a
      real Date value), same reasoning — sortable as a date, not a string.
13. **PDF layout — a genuinely different mechanism from Excel's, since
    `pdfkit` has no built-in "repeat header per page" or "fit to page width"
    like a spreadsheet does.** Needs to be built by hand:
    - Page size A4, layout `'landscape'`.
    - Column widths chosen up front (fixed x-positions per column) sized
      against realistic longest content per column, since `pdfkit` draws text
      at explicit coordinates — there's no auto-fit. One line per order is a
      hard requirement (per the request), so long values (a long customer
      name, a multi-item Order Items cell) may need truncation with an
      ellipsis rather than wrapping, or a slightly smaller font specifically
      for that column — a real layout decision to make once realistic content
      widths are known, not guessable in the abstract.
    - Manual pagination: track the current y-position while drawing rows, and
      when a row would overflow the printable area, call `doc.addPage()` and
      **redraw the column header row** at the top of the new page before
      continuing — `pdfkit` won't do this automatically the way `exceljs`'s
      `printTitlesRow` does.
    - The summary header block (title/date range/filter line/totals) is drawn
      once, only on page 1, above the table — not repeated on subsequent
      pages (only the column header repeats, per the request's own PDF mockup
      showing the summary above the table once).

## Proposed shape (subject to the decisions above)

**Backend**:
- `order.service.ts`: `buildOrderExportWhere(actingUser, filters)` (decision
  #9) — shared by everything below. Filters: `dateFrom`/`dateTo` (already
  end-of-day-normalized before reaching here), `payment: all|paid|unpaid`,
  `district: string | 'all'`, `delivery: all|delivered|undelivered`.
- `GET /api/orders/export/count?...` → `{ count }` (decision #10).
- `GET /api/orders/export/excel?...` → `.xlsx` file (decision #12's layout).
- `GET /api/orders/export/pdf?...` → `.pdf` file (decision #13's layout, plus
  the summary header block — needs `SUM(total)`, `SUM(total) WHERE paid`,
  `SUM(total) WHERE unpaid` over the same filtered set; simplest to compute by
  summing the already-fetched row set in memory during generation rather than
  a separate aggregate query, since the rows are already loaded to build the
  table anyway).
- New Zod schema (`orderExportQuerySchema`) validating the above; reuses
  `paymentStatusSchema`/`deliveryStatusSchema` where it can, with the
  all/paid/unpaid and all/delivered/undelivered shorthands mapped to real enum
  filters per decisions #2–#3.
- Query needs `customer` (name, primary phone, address.district),
  `items`→`product.name` + `quantity`, `articleNumber`, `total`, `paymentStatus`,
  `deliveryStatus`, `orderDate`, `orderNumber` — a dedicated `select`, not the
  full order-detail shape used elsewhere (this can get large; keep it lean).
- Controllers set `Content-Disposition: attachment; filename="orders-<from>-to-<to>.xlsx|.pdf"`
  and the correct `Content-Type` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  for xlsx, `application/pdf` for pdf — same content-type the existing
  parcel-summary endpoint already uses).
- Quick-preset buttons (Today/Yesterday/Last 7 days/This month/Last month)
  resolved to concrete `from`/`to` dates **on the frontend** before any
  request, so the backend only ever handles one shape (explicit date range).

**Frontend**:
- New `DownloadOrdersDialog` component (or similar), opened from a new button
  next to Orders' existing "+ Create Order" in its `PageHeader`'s `action` slot
  (`Orders.tsx:168-173`) — Orders page and its table stay otherwise unchanged,
  per instruction.
- Filter state: date mode (`today`/`yesterday`/`last7Days`/`thisMonth`/
  `lastMonth`/`custom`) + explicit from/to when custom; payment
  (`all`/`paid`/`unpaid`); area (`all`/a selected district); delivery
  (`all`/`delivered`/`undelivered`). All default to "All"/no restriction.
- "Select Area..." populated from a new districts endpoint (or derived
  client-side) — depends on decision #4.
- Live "N orders found" text, refetching `.../export/count` (debounced) on
  every filter change (decision #10) — shown between the filters and the
  Cancel/Download row.
- Two buttons, "Download Excel" / "Download PDF". Per decision #7, each
  fetches its file as a blob (not a plain link/window-open) so the app can
  show its own loading state around the request.
- While a download request is in flight, that button shows "Generating
  report…" (disabled, spinner) instead of its normal label, reverting the
  instant the blob resolves and the synthetic-download click fires — covers
  the case where generation takes a couple of seconds at higher order counts,
  so the click doesn't feel like it did nothing.

## TODO checklist

- [ ] Resolve open decisions #1–#4 above (dateTo inclusivity scope, Unpaid/
      Undelivered mapping, Area field + picklist source) before writing code.
- [ ] Add `exceljs` to `backend/package.json` (PDF needs no new dependency —
      reuses existing `pdfkit`).
- [ ] `orderExportQuerySchema` (Zod) in `order.schema.ts`.
- [ ] `buildOrderExportWhere(actingUser, filters)` in `order.service.ts`
      (decision #9) — single source of truth for count + both export formats.
- [ ] `GET /api/orders/export/count` route + controller (decision #10).
- [ ] `orderService.exportExcel(actingUser, filters)` — scoped query, lean
      `select`, `exceljs` workbook with decision #12's page setup/formatting.
- [ ] `orderService.exportPdf(actingUser, filters)` — same scoped query,
      `pdfkit` document with decision #13's manual pagination/header-repeat,
      plus the summary header block (title, date range, active-filter
      summary line, Orders/Total Amount/Paid/Unpaid stats).
- [ ] `GET /api/orders/export/excel` and `GET /api/orders/export/pdf` routes
      (`authorize('order:view')`) + controllers setting correct headers.
- [ ] Districts endpoint (or client-derived list) backing the Area picklist.
- [ ] Confirm `orderDate`/`paymentStatus`/`deliveryStatus` have DB indexes (or
      add them) — the export's whole performance case rests on the date-range
      query being index-backed, not a sequential scan.
- [ ] `DownloadOrdersDialog` frontend component: quick-date buttons, custom
      date pair, payment/area/delivery radios, live order-count text,
      Cancel/Download Excel/Download PDF actions.
- [ ] Blob-fetch download flow (decision #7) with a "Generating report…"
      loading state on whichever download button is in flight.
- [ ] Wire the dialog into `Orders.tsx`'s `PageHeader` action slot — no other
      change to the existing Orders page/table.
- [ ] Verify data-scope correctness: an Employee's export/count only contains
      their own assigned orders, a Manager's only their team's, matching the
      normal Orders list for the same account (not a re-derived/looser rule).
- [ ] Verify the 4-filter combination behaves as AND, with every "All"
      default producing the same result as the unfiltered Orders list for that
      role.
- [ ] Verify the live count always matches the actual downloaded row count for
      the same filters (decision #9's whole point) — check this explicitly,
      not just each in isolation.
- [ ] Verify `dateTo`'s end-of-day inclusivity fix with a real order placed
      late in the day on the `to` date.
- [ ] Verify the downloaded Excel opens correctly (Excel/LibreOffice/Google
      Sheets) with correct column headers, formats, and readable Order Items
      cells.
- [ ] Verify the downloaded PDF: summary header numbers match the count/
      filters used, every order stays on one line (no wrapping), column
      header repeats correctly if the export spans multiple pages, summary
      block appears once (page 1 only).
- [ ] Verify large exports (a full month, whatever order volume that is
      currently) complete in reasonable time and don't need pagination/
      streaming for this app's actual data size — rough targets: sub-second at
      ~100 orders, low single-digit seconds even at 10,000+, per decision #11.
- [ ] Verify the Excel file prints cleanly on one A4 landscape page wide (real
      print preview, not just on-screen review) — header repeats on page 2+ if
      the export spans multiple pages.
- [ ] Verify the PDF prints/displays correctly on real A4 landscape — this is
      the format's whole purpose, so a rendered/printed check matters more
      here than for Excel.
