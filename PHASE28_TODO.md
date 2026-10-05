# Phase 28 — Desktop: sidebar and navbar stay fixed while the page scrolls

**Status: released and verified on production 2026-10-05 (see "Production release"
at the end).**

- **Browser: 6/6** on a throwaway Docker Postgres (`crm-phase28-test`, `localhost:55432`).
- `tsc` and ESLint clean.

(Phase 27 — Trash Detail — was developed separately and shipped in the same release.)

## The request, as given

On laptop/desktop, the sidebar (and the top navbar) stay put while only the content
scrolls — on long Orders / Customers / Employees / Trash pages the sidebar stays
visible. If the sidebar's menu is ever taller than the screen, it scrolls on its own.

## Current structure

`AppShell` in `frontend/src/App.tsx`: a flex row — `Sidebar` (desktop only, `md:`) +
a column with `Navbar`, the page (`PageContainer`) and `Footer`. **The whole window
scrolls**, so the sidebar and navbar scroll away with the page.

## Approach (decided)

**Sticky, not a separate scroll box.** The window keeps scrolling, but:

- **Sidebar:** `md:sticky md:top-0 md:h-screen md:self-start md:overflow-y-auto` —
  pinned, exactly one screen tall, with its own scroll. `self-start` stops the flex
  row stretching it to the page's full height, which would defeat sticky.
- **Navbar:** `md:sticky md:top-0 md:z-30` — pinned to the top of the content column,
  above page content but below dialogs and dropdowns (z-50).

On screen this is identical to "only the content scrolls". Keeping window scrolling
preserves the browser's scroll restore on Back, printing of long pages (Print Parcel
Summary / printable order), Ctrl+F and normal wheel behaviour — a fixed-height shell
with an inner scroll box would break those.

**Mobile is unchanged:** below `md` the sidebar is the slide-out menu and the navbar
scrolls with the page, as before.

**Files:** `frontend/src/components/Sidebar.tsx`, `frontend/src/components/Navbar.tsx`
(class changes + comments).

## TODO checklist

- [x] Sidebar + Navbar sticky on desktop
- [x] `tsc` / ESLint
- [x] Local browser verification (Docker DB only) — **6/6**:
  - [x] Desktop 1366×768, Orders page scrolled to the bottom: page really scrolled; sidebar pinned at top-left, full screen height; navbar pinned at top; footer reached — L1
  - [x] Sidebar links work while scrolled — L1b
  - [x] Short window (260px): the sidebar menu scrolls on its own and reaches Trash; the window itself doesn't scroll — L2
  - [x] Dropdown options and the search dialog render above the pinned navbar — L3
  - [x] Orders list scrolled → open an order → Back: scroll position restored — L4
  - [x] Mobile 390px unchanged: no sidebar column, navbar scrolls away, slide-out menu works — L5

## Production release (2026-10-05)

Pushed with Phase 27: `f06ba17` (docs) + `f4b63f2` (code), at 22:44. Vercel served
the new bundle `index-D7RaHtjw.js` at 22:44:37.

**Pre-push print check (local):** under print media the sidebar and navbar are
hidden as before, no scroll box clips the printed content, and the PDF renders —
desktop and mobile.

**Production check: read-only**, as `test@gmail.com` (Employee), with all writes
blocked in the browser. No test data was created.

| # | Check | Result |
|---|---|---|
| Q1 | Desktop 1366×768, Products scrolled to the bottom (1189px): sidebar pinned (top 0, full height), navbar pinned | ✅ |
| Q2 | Sidebar navigation works while scrolled | ✅ |
| Q3 | Mobile 390px unchanged: no sidebar column, navbar scrolls away | ✅ |
| G | No write attempted | ✅ |
