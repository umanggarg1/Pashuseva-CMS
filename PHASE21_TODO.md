# Phase 21 — Orders Export (Download Orders with Filters)

**Status: backend and frontend both done and verified end-to-end (real browser,
real downloads, real cross-checked counts). The PDF's row layout went through
two further revisions: first a fixed-2-line-row compact design with a
`+N items` overflow marker (found and fixed a bug where that marker could
itself get truncated away), then a final revision that drops Order
Number/Area entirely in favor of a per-report S.No., uncaps Order Items to
show every item with genuinely variable row height, and locks column
alignment. Excel was then brought into line with the same core structure and
abbreviation codes (own revision, see "Excel revision" section below) while
deliberately keeping Order Number and Area — now Area/PIN Code — since
Excel's whole purpose is finding/filtering/managing the data, unlike the
print-only PDF. Nothing committed yet.**

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

## PDF layout revision — compact fixed-height rows, abbreviation codes (supersedes decision #13's "one line per order")

Later revision, after the initial one-line-per-order PDF was built and
reviewed: rather than ellipsizing everything down to one line (which was
already showing real cracks — e.g. every order number had to be given 90+pt
of column width just to avoid truncating to an identical, useless prefix),
switch to a **fixed 2-line-tall row**, with Customer/Phone/Items each
wrapping onto up to 2 lines instead of ellipsizing, and Payment/Delivery
compressed to short, documented codes to free up the width that buys.

**Locked abbreviations** (fixed set, not one code per real enum value —
documented in a legend printed once on the report so they're never
ambiguous):

- Payment: `P` = Paid, `UP` = Unpaid, `PP` = Partially Paid, `RF` = Refunded
  (this last one wasn't in the original locked list, which only covered
  Paid/Unpaid/Partially Paid — extended the same abbreviation style since
  every row still needs *something* to print, and REFUNDED is a real,
  reachable `paymentStatus` value).
- Delivery: `D` = Delivered, `DP` = Dispatched, `T` = In Transit, `OFD` = Out
  for Delivery, `UDP` = Not Dispatched, `UD` = Undelivered — a deliberate
  catch-all for every real status not covered by the other five
  (`RETURN_PENDING`/`RETURN_IN_TRANSIT`/`RETURNED`/`LOST`/`DAMAGED` all print
  as `UD`), matching the fixed 6-code set as given, not expanded to 10.

**Per-column rules**:

- **Customer name**: wraps naturally up to 2 lines, ellipsis only if even 2
  lines isn't enough — never aggressively truncated to "Rajesh Ku…" the way
  the original one-line design had to.
- **Phone**: every phone number shown, one per line, up to 2 lines (the data
  model realistically only ever has 1–2 anyway) — never dropped down to just
  the primary number the way Excel's single-line comma-joined format has to.
- **Order Items**: line 1 is always the first item; line 2 is the second item
  plus `+N items` when there are more than 2 (`Cow Feed ×2` / `Jadi Boti ×1
  +3 items`) — never silently hides how many more items exist past the
  second.
- **Article No.**: kept to one line always, at a slightly smaller font (8pt
  vs. the table's usual 9pt) rather than wrapped or wrapped-then-ellipsized —
  it's a tracking identifier, most useful shown intact.
- **Area**: unaffected by this revision — stays single-line with ellipsis, as
  before (not mentioned in the compact-layout request, and dropping it
  entirely wasn't requested either — kept rather than silently removed just
  because the illustrative ASCII mockup happened to omit it for brevity).
- Row height is **fixed** regardless of content — an order with 2 phones and
  5 items takes exactly the same vertical space as one with 1 phone and 1
  item, which was the explicit point of this whole revision.

**Found and fixed one real bug via visual verification** (the same discipline
as the earlier ₹-symbol and row-overlap bugs — rendering the actual output,
not just reading the code): the `+N items` overflow marker was itself getting
ellipsis-truncated away whenever the second item's name was long enough to
fill the column — e.g. `CALCIUM AND MINERALS (5 kg) ×1 +1 items` would render
as `CALCIUM AND...` with the `+1 items` part silently cut off, defeating the
one thing that marker exists to communicate. Fixed by measuring the suffix's
width first (`doc.widthOfString`) and reserving it, so only the item *name*
gets truncated, never the count. Confirmed fixed against a real order with 3
items (`ORD-2026-000083`): now renders `ANTI TICK SOAP ×6` / `CALCIUM AND… +1
items` — the name truncates, the count doesn't.

- [x] Locked abbreviation tables (`DELIVERY_CODE`/`PAYMENT_CODE` in
      `orderExport.service.ts`) and a legend printed once, directly under the
      summary block, spelling out every code.
- [x] Rewrote column widths for the new layout (Order 88, Date 52, Customer
      118, Phone 82, Area 55, Article No. 82, Items 138, Amount 58, Pay 33,
      Del 36 — totals 742pt, comfortably under A4 landscape's ~782pt
      printable width at 30pt margins).
- [x] Fixed row height (`ROW_HEIGHT = LINE_HEIGHT * 2 + 4`) applied uniformly;
      single-line columns use `ONE_LINE_TEXT_OPTIONS` (unchanged from the
      original one-line design), multi-line columns use a new
      `TWO_LINE_TEXT_OPTIONS` (wraps naturally, `height` caps at 2 lines,
      ellipsis only past that).
- [x] `drawItemsCell` — a dedicated drawing function rather than a plain
      string, specifically to fix the `+N items` truncation bug above.
- [x] Verified visually (Playwright + Chrome, real data): 2-line customer
      wrap confirmed (`RAJESH MADHUKAR SHINDEE` wraps to 2 lines), both
      phones confirmed stacked on a real 2-phone customer, legend renders
      correctly and completely, Article No. stays single-line at the smaller
      font, row separator lines aid readability with the now-variable-looking
      row content, header still repeats correctly on subsequent pages.
- [x] `tsc --noEmit` and full `npm run build` clean on the backend afterward;
      re-confirmed the Excel export (unaffected by this PDF-only revision)
      still returns 200 after the shared `OrderExportRow` shape changed to
      carry `phones`/`items` as raw arrays (for the PDF's per-line rendering)
      alongside the pre-joined `itemsSummary` Excel already used.
- [ ] Not re-verified after this revision: the full combined-filter
      end-to-end walkthrough (count → both downloads) done for the previous
      one-line PDF design — worth a quick repeat if this ships, though the
      underlying data/count logic (`buildOrderExportWhere`,
      `getExportRows`) wasn't touched by this layout-only change.

## PDF layout, final revision — drops Order Number/Area, uncaps Items, locks alignment

Supersedes the fixed-2-line-row design directly above. **Applied to the PDF
only** — every message in this back-and-forth was specifically about the
printable A4 report ("A4 landscape report", "print", row-height/pagination
concerns), so Excel's columns (Order Number, Area, full `Payment`/`Delivery`
text labels, `itemsSummary` as one joined line) are deliberately untouched.
Flagging this interpretation explicitly rather than silently assuming it —
easy to extend to Excel too if that's actually wanted.

**Columns, final**: `S.No. | Date | Customer | Phone No. | Article No. |
Order Items | Amount | Payment | Delivery` — 9 columns, no Order Number, no
Area.

- **S.No.**: sequential per report (1, 2, 3…), reset every download — never
  the database order id. The order number isn't printed anywhere on this
  report at all anymore (a real, deliberate tradeoff the request made
  explicitly and repeatedly, not something I inferred).
- **Order Items**: every item now prints, one per line, genuinely uncapped —
  the earlier `+N items` marker is gone entirely, superseded by just showing
  everything. Individual item lines still ellipsize in the rare case one
  product name alone is too long for the column, but the item *count* is
  never hidden.
- **Row height is now per-row variable** (this is the direct consequence of
  uncapping Items): `max(customer lines ≤2, phone lines ≤2, item count, 1) ×
  LINE_HEIGHT`. Verified visually against real data — a 1-item order and a
  3-item order sit side by side with visibly different row heights, each
  exactly as tall as its own content needs, not padded to a shared fixed
  height the way the previous revision worked.
- **Alignment, locked exactly per the final table given**: S.No./Date/Phone
  No./Article No./Amount/Payment/Delivery are centered **both horizontally
  and vertically** within the row (`drawCentered`/`drawPhoneCentered` compute
  a vertical offset from the row's actual height, not just `align: 'center'`
  horizontally); Customer/Order Items stay left-aligned and top-aligned
  (natural for multi-line, top-to-bottom text). Header row text is centered
  for every column regardless of that column's own data alignment, per
  instruction.
- **Payment/Delivery headers are full words** ("Payment"/"Delivery"), while
  the per-row *values* stay the locked short codes (`P`/`UP`/`PP`/`RF` and
  `D`/`DP`/`T`/`OFD`/`UDP`/`UD`) — narrow columns, full-word headers, exactly
  as specified.
- Legend (unchanged from the prior revision) still prints once under the
  summary block, documenting every code.

**Verified visually** (Playwright + Chrome, all 47 orders, unfiltered):
confirmed all 9 columns present with no Order/Area column anywhere; S.No.
counts 1, 2, 3…; a real 3-item order (`ORD-2026-000083`) now shows all 3
items on 3 separate lines with no `+N` marker; row height genuinely varies
(a 1-item row is visibly shorter than the 3-item row next to it); a 2-phone
customer (`VINOD SINGH SO LALLU SINGH`) shows both numbers; Payment/Delivery
columns show full-word headers with short centered codes underneath; legend
and header-repeat-on-page-2 both still correct. Total page count for the
same 47-order unfiltered export: 3 pages (down from 4 in the fixed-2-line
revision, since single/few-item orders are no longer padded to a forced
2-line minimum).

- [x] Rewrote `PDF_COLUMNS`/`PDF_COLUMN_LABELS` — 9 columns, no
      `orderNumber`/`area`.
- [x] `estimateLineCount` (via `doc.heightOfString`) sizes the row correctly
      for a short vs. long customer name; `drawItems` draws exactly
      `items.length` lines so the row-height calculation and the actual
      drawn content can never disagree.
- [x] `drawCentered`/`drawPhoneCentered` — true 2D centering (horizontal via
      `align: 'center'`, vertical via a computed y-offset from the row's
      actual height), not just horizontal centering left over from the
      previous revision.
- [x] Per-row variable-height pagination: the page-break check now uses each
      row's own computed height, not a shared constant.
- [x] `tsc --noEmit` and full `npm run build` clean on the backend.
- [x] Re-confirmed the Excel export still returns 200 (untouched by this
      PDF-only change, but confirmed rather than assumed).
- [ ] Not yet re-run after this revision: the full combined-filter
      count-vs-both-downloads walkthrough (same caveat as the prior
      revision — the underlying data/count logic wasn't touched, only PDF
      drawing code, but a full re-run would still be the thorough thing to
      do before this ships).
- [x] Confirmed with the user: Excel should mirror the same core structure
      and abbreviation codes, while deliberately keeping Order Number and
      Area (as Area/PIN Code) — see "Excel revision" below.

## Excel revision — same core structure/codes as the PDF, plus a report summary, minus Order Number/Area which Excel keeps

**Final Excel columns**: `S.No. | Order | Date | Customer | Phone No. |
Area / PIN Code | Article No. | Order Items | Amount | Payment | Delivery` —
11 columns. Keeps Order Number and Area (unlike the PDF) since they're
genuinely useful for finding/filtering a specific order later, which is
Excel's whole purpose — the PDF/Excel split stays exactly what it was always
meant to be: **PDF optimized for printing, Excel optimized for
searching/filtering/managing.**

**Brought in line with the PDF**:
- Same abbreviation codes (`P`/`UP`/`PP`/`RF`, `D`/`DP`/`T`/`OFD`/`UDP`/`UD`)
  for Payment/Delivery, not full-word labels — `DELIVERY_CODE`/`PAYMENT_CODE`
  and the legend text are now hoisted to the top of `orderExport.service.ts`
  and shared by both generators, not duplicated.
- Same report summary block (title, date range, active-filter line,
  Orders/Total/Paid/Unpaid) — `ExportSummary` (renamed from the PDF-only
  `PdfSummary`) is now the shared type both `generateOrdersExcel` and
  `generateOrdersPdf` take, and `order.controller.ts` computes it once
  (`buildExportSummary`) for whichever format was requested, rather than
  duplicating the total/paid/unpaid math per format.
- Same legend text, printed as two more rows in the summary block (Excel has
  no "print once on page 1" concept the way `pdfkit`'s manual pagination
  does, so this is the natural Excel equivalent).
- All items retained, one per line (`\n`-joined within the cell, `wrapText`
  on), never truncated — same principle as the PDF's uncapped Items column.
- Phone numbers each on their own line, same as the PDF.

**New — Area/PIN Code**: added `pincode` to the export data path
(`order.repository.ts`'s `findAllForExport` now selects `pincode` alongside
`district`; `OrderExportRow` carries it as `pincode: string`). Rendered as
`Area\nPIN` in a single wrapped, centered cell — and critically, `numFmt =
'@'` (text format) on that cell so Excel never reinterprets the PIN as a
number and silently drops a leading zero.

**Formatting**: header row bold + centered; every data column wrapped and
vertically centered (Excel's rule here is simpler than the PDF's — *every*
column vertically centered, only horizontal alignment varies: Customer/Order
Items stay left, everything else centered); sensible fixed column widths
rather than attempting real auto-fit (`sheet.columns` widths chosen by hand,
per instruction not to "blindly auto-fit"); header row frozen; auto-filter
enabled across the full table range (header through the last data row, not
just the header — a filter scoped to only the header row wouldn't actually
filter anything); real `Date`/`₹`-formatted `Amount` cells retained (sortable/
summable, the original reason to offer Excel at all); print setup (A4
landscape, fit-to-width) retained from the original design, with
`printTitlesRow` now pointing at the table's actual header row rather than a
hardcoded row 1.

**Not merging any cells anywhere** (including the summary block above the
table), per instruction — keeps the actual table itself, and the whole
sheet's row/column model, simple and filter/sort-safe.

**The summary block's row count varies** (an extra row appears only when
`filterSummaryLine` is non-null), so the table's header row number, freeze
point, auto-filter range, and `printTitlesRow` are all computed dynamically
from `sheet.rowCount` as the summary rows are added — never hardcoded to a
fixed row.

**Verified**: `tsc --noEmit` and full `npm run build` clean. Read the
generated file back programmatically (`exceljs`) rather than just visually
inspecting, since exact cell-level properties matter here — confirmed: 12
total rows for a 2-order test (9 summary/legend/blank rows + 1 header + 2
data); frozen pane `ySplit: 10` (exactly the header row); `autoFilter:
'A10:K12'` (full table, not just the header); `printTitlesRow: '10:10'`;
header row bold with every cell `{horizontal: 'center', vertical: 'middle',
wrapText: true}`; a real 3-item order (`ORD-2026-000083`) shows all 3 items
newline-separated in one cell, not truncated; Date cell is a real `Date`
value with `numFmt: 'dd/mm/yyyy'`; Amount is a real number with `numFmt:
'"₹"#,##0.00'`; Area/PIN cell shows `"DUMKA\n814141"` with `numFmt: '@'`
(text, not number); Payment/Delivery show the short codes (`"UP"`/`"UDP"`),
matching the PDF; Customer/Order Items cells are left-aligned, every other
column centered — all exactly as specified.

- [x] Hoisted `DELIVERY_CODE`/`PAYMENT_CODE`/legend text/`ExportSummary` to
      the top of `orderExport.service.ts`, shared by both generators.
- [x] `order.controller.ts`: extracted `buildExportSummary(rows, filters)`,
      now called once by each of `exportExcel`/`exportPdf` instead of the
      total/paid/unpaid math living only in the PDF path.
- [x] `order.repository.ts`: `findAllForExport`'s address select now
      includes `pincode` alongside `district`.
- [x] `order.service.ts`: `OrderExportRow` carries `pincode: string`;
      `getExportRows` populates it.
- [x] Rewrote `generateOrdersExcel` — 11-column layout, summary block, legend
      rows, dynamic header-row/freeze/auto-filter/printTitlesRow, per-cell
      alignment/wrap, PIN text format.
- [x] Fixed two things caught during my own review before verifying (not
      user-reported, found by re-reading the diff): an O(n²) `rows.indexOf(row)`
      for the S.No. column (switched to a proper indexed `.forEach`), and an
      `autoFilter` that only spanned the header row rather than the full
      table (would have rendered filter dropdowns that don't actually filter
      anything).
- [x] Re-confirmed the PDF export still returns 200 after sharing
      `ExportSummary`/the legend constants with Excel.
- [ ] Not yet re-run: the full combined-filter end-to-end walkthrough
      (dialog → count → both downloads) — the frontend wasn't touched by this
      change, and the count/filter logic wasn't either, but a full re-run
      would still be the thorough thing to do before this ships.

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

**Backend — done, verified.**

- [x] Locked decisions #1–#4 exactly per the review that closed out planning:
      `dateTo` end-of-day inclusive (export only, existing `/orders` list left
      as-is); Unpaid = PENDING+PARTIAL, Paid = PAID only, REFUNDED visible only
      under All; Undelivered = anything but DELIVERED; Area = `Customer.
      address.district`, normalized (trim + case-insensitive dedupe) dropdown.
- [x] Added `exceljs` to `backend/package.json` (PDF needed no new dependency —
      reuses existing `pdfkit`).
- [x] `orderExportFiltersSchema` (Zod) in `order.schema.ts`.
- [x] `buildOrderExportWhere(actingUser, filters)` in `order.service.ts` —
      single source of truth, used by `exportCount` and `exportRows` alike
      (decision #9's whole point).
- [x] `GET /api/orders/export/count` route + controller.
- [x] `orderExport.service.ts`: `generateOrdersExcel` (exceljs, decision #12's
      page setup/formatting — A4 landscape, fit-to-width, frozen + repeated
      header, real Date/₹ cell formats) and `generateOrdersPdf` (pdfkit,
      decision #13's manual pagination/header-repeat, summary header block).
- [x] `GET /api/orders/export/excel` and `GET /api/orders/export/pdf` routes
      (`authorize('order:view')`) + controllers setting correct headers,
      registered before `/:id` (same reasoning as the existing
      `/number/:orderNumber` route).
- [x] `GET /api/customers/districts` backing the Area picklist — normalized
      (trim + case-insensitive dedupe) in `customerService.getDistinctDistricts`,
      gated on `customer:view` (already in `DEFAULT_EMPLOYEE_PERMISSIONS`
      alongside `order:view`, so this doesn't newly block a normal Employee).
- [x] Confirmed `orderDate`/`paymentStatus`/`deliveryStatus` already have DB
      indexes — added in Phase 14 §15, nothing new needed. `district` has no
      index; left as-is per the "measure before optimizing" approach — fine at
      this app's real data volume (checked: ~47 orders, ~46 customers).
- [x] Verified data-scope correctness by construction: `buildOrderExportWhere`
      starts from the same `orderDataWhere(actingUser, ...)` scope as the
      normal list's `buildOrderWhere` — an Employee/Manager's export is scoped
      identically to what they already see.
- [x] Verified the 4-filter combination live against the local dev DB:
      unfiltered count 47; `payment=unpaid` → 41; `delivery=delivered` → 4 —
      consistent with previously-known dashboard figures (47 total, 6 paid ⇒
      41 unpaid).
- [x] **Verified the live count always matches the actual file** — count with
      `payment=unpaid` returned 41; the Excel export with the same filter
      produced exactly 41 data rows (42 including the header row). Confirms
      decision #9 holds in practice, not just by code inspection.
- [x] Verified `dateTo`'s end-of-day normalization directly in
      `buildOrderExportWhere` (sets `23:59:59.999` on the given date before
      building the `lte` filter) — matches decision #1.
- [x] **Found and fixed two real bugs via actual visual verification (Playwright
      + Chrome's native PDF viewer, not just code review) — worth recording
      since they'd have shipped broken otherwise**:
  1. The ₹ symbol rendered as a garbled character in the PDF — `pdfkit`'s
     standard fonts (Helvetica etc.) are WinAnsi/Latin-1 only, no ₹ glyph.
     Same class of issue `parcelSummary.service.ts` already worked around by
     using "Rs." instead — applied the same fix here. Excel is unaffected
     (its `numFmt` currency symbol isn't a font-rendered glyph the same way)
     and keeps the real ₹ symbol.
  2. Table rows visually overlapped/collided, and long values (e.g. the order
     number) wrapped onto a second line instead of ellipsizing — `width` +
     `ellipsis: true` alone doesn't force single-line clipping in `pdfkit`;
     an explicit `height` constraint (one line's worth) was needed too. Also
     rebalanced column widths after finding every order number was truncated
     to an identical, useless "ORD-2026-00…" prefix — defeating the report's
     purpose of identifying which row is which order.
- [x] `tsc --noEmit` clean on the backend throughout.
- [x] Verified the downloaded Excel opens correctly — read it back
      programmatically (exceljs): correct headers, 42 rows (41 unpaid + header,
      matching the count), real `Date` object with `dd/mm/yyyy` format on the
      Date cell, real number with `"₹"#,##0.00` format on Amount, `pageSetup`/
      `views` (frozen pane) all persisted exactly as set.
- [x] Verified the downloaded PDF visually (Playwright + Chrome's native PDF
      viewer, all 47 orders, unfiltered): summary numbers (Orders: 47, Total
      Rs. 74,400, Paid Rs. 6,200, Unpaid Rs. 68,200) correct; every order on
      one line, ellipsis truncation working on long values; spanned 2 pages,
      column header correctly repeated on page 2; summary block appeared once,
      page 1 only.
- [x] Verified at this app's actual current volume (47 orders) — both formats
      generated with no noticeable delay (well under a second each). Not
      stress-tested at thousands of rows (no realistic way to generate that
      test data here) — the low-volume numbers are real, the 10,000+ estimate
      in decision #11 remains an estimate, not measured.
- [ ] Excel real print-preview — verified the underlying page-setup values
      persist correctly (paperSize 9/A4, landscape, fitToWidth 1, fitToHeight
      0, printTitlesRow '1:1') by reading the file back programmatically, but
      did not visually render a print preview the way the PDF was rendered.
      Reasonable next check if this matters before shipping — Excel's own
      print preview (Ctrl+P) against the real downloaded file.

**Frontend — done, verified end-to-end.**

- [x] `DownloadOrdersDialog.tsx`: date presets (Today/Yesterday/Last 7 days/
      This month/Last month/Custom, defaulting to none selected = no date
      restriction — consistent with "All is the default" for the other three
      filters), Payment/Delivery as button-group toggles (matching the app's
      existing single-choice-from-a-small-set pattern, e.g.
      `AddPaymentDialog`'s Full/Partial toggle in `OrderDetail.tsx` — not new
      radio-input styling, which the app has no existing component for), Area
      as a `Select` populated from `/api/customers/districts`.
- [x] Live debounced count (`useDebouncedValue`, 300ms) via a single
      `buildExportParams(filters)` function — the *exact same* function builds
      the query string for the count request and both download requests, so
      the two can never drift apart (decision #9, now enforced in the frontend
      too, not just the backend).
- [x] Both downloads use `fetch(..., { credentials: 'include' })` + blob +
      synthetic `<a>` click (not a plain link/window-open), with a per-button
      "Generating report…" state while its request is in flight (decision #7).
- [x] Wired in as a new "Download Orders" button in `Orders.tsx`'s
      `PageHeader` action slot, next to the existing "+ Create Order" —
      confirmed the existing Orders table, filters, pagination, and
      order-fetching logic are untouched (only the two `import` lines and the
      `action` JSX changed in `Orders.tsx`).
- [x] `tsc --noEmit` clean on the frontend.
- [x] **Full end-to-end verification, real browser (Playwright + Chrome),
      exactly the sequence requested**: opened Orders → Download Orders →
      confirmed default count (47, matching the unfiltered total) → changed
      Payment to Unpaid (41 — matches the previously-known 6 paid ⇒ 41 unpaid)
      → added Delivery: Undelivered (still 41 — i.e. all 41 unpaid orders are
      also undelivered, consistent with only 4 orders total being Delivered)
      → added Area: GURUGRAM → added a custom date range (1–8 Sep 2026) →
      **combined-filter count: 0**.
  - Verified this 0 is *correct*, not a bug: the one known Gurugram order is
    Paid and NOT_DISPATCHED, so `Payment=Unpaid` alone excludes it — 0 is the
    right answer for this specific combination, confirmed by reasoning through
    the underlying data, not just trusting the number.
  - **Cross-checked the UI's displayed count against a direct API call using
    the identical serialized params** (`dateFrom=2026-09-01&dateTo=2026-09-08&
    payment=unpaid&district=GURUGRAM&delivery=undelivered`) — both returned
    `0`, confirming the frontend's `buildExportParams` and the backend's
    `buildOrderExportWhere` agree exactly, not just individually correct.
  - Downloaded both formats for this combined filter via real Playwright
    `download` events (not just checking response headers) — Excel and PDF
    both saved successfully, small non-zero file sizes.
  - **Verified the zero-result PDF renders gracefully, not broken**: correct
    date range, correct filter-summary line ("Area: GURUGRAM | Payment:
    Unpaid | Delivery: Undelivered"), correct summary stats (Orders: 0, Total
    Amount: Rs. 0, Paid: Rs. 0, Unpaid: Rs. 0), correct column headers, no
    data rows, no crash.
  - Screenshot of the dialog itself (mid-flow, all four filters set, "0
    orders found") confirmed the UI matches the originally requested mockup:
    toggle groups showing the selected option highlighted, Area select
    showing "GURUGRAM", custom date inputs populated, live count text, and
    the Cancel/Download Excel/Download PDF footer.
- [x] **Debounce/network-consistency check, done carefully rather than
      assumed**: an early test run misread the live count using a fixed sleep
      + polling loop rather than watching for the actual network response,
      which produced misleading (stale) intermediate readings. Redid it with
      explicit `page.waitForResponse` per filter change, isolating the
      question precisely — confirmed the debounce and refetch genuinely work
      correctly for both a single change and rapid sequential changes; the
      earlier confusing result was a test-methodology artifact, not an app
      bug. Recorded here since it's a real lesson for testing this dialog
      again later: assert on the actual network request, not on a fixed-delay
      read of the displayed text.
