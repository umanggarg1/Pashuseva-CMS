import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { OrderExportRow } from './order.service';
import type { PaymentStatus, DeliveryStatus } from '../generated/prisma/enums';

function formatDateDDMMYYYY(date: Date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

// Shared by both generateOrdersExcel and generateOrdersPdf — same summary
// block (title, date range, active-filter line, Orders/Total/Paid/Unpaid) on
// both formats, per PHASE21_TODO.md's Excel revision bringing it in line
// with the PDF's report header.
export interface ExportSummary {
  dateRangeLabel: string;
  filterSummaryLine: string | null;
  orderCount: number;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
}

// Locked abbreviations, shared by both formats now — documented in a legend
// printed once on each report so there's no ambiguity reading the codes.
// "UD" is deliberately a catch-all for every status that isn't one of the
// other five (RETURN_PENDING/RETURN_IN_TRANSIT/RETURNED/LOST/DAMAGED) — the
// six-code set is a fixed, locked design, not one code per real enum value.
const DELIVERY_CODE: Record<DeliveryStatus, string> = {
  NOT_DISPATCHED: 'UDP',
  DISPATCHED: 'DP',
  IN_TRANSIT: 'T',
  OUT_FOR_DELIVERY: 'OFD',
  DELIVERED: 'D',
  RETURN_PENDING: 'UD',
  RETURN_IN_TRANSIT: 'UD',
  RETURNED: 'UD',
  LOST: 'UD',
  DAMAGED: 'UD',
};
const PAYMENT_CODE: Record<PaymentStatus, string> = {
  PENDING: 'UP',
  PARTIAL: 'PP',
  PAID: 'P',
  // Not called out explicitly in the locked code list (which only covers
  // Paid/Unpaid/Partially Paid) — REFUNDED still needs *something* to print
  // per row, so this extends the same abbreviation style consistently.
  REFUNDED: 'RF',
};
const LEGEND_PAYMENT = 'Payment: P = Paid, UP = Unpaid, PP = Partially Paid, RF = Refunded';
const LEGEND_DELIVERY =
  'Delivery: D = Delivered, DP = Dispatched, T = In Transit, OFD = Out for Delivery, UDP = Undispatched, UD = Undelivered (Returned/Lost/Damaged)';

const EXCEL_COLUMNS = [
  { header: 'S.No.', key: 'sNo', width: 7 },
  { header: 'Order', key: 'orderNumber', width: 16 },
  { header: 'Date', key: 'orderDate', width: 12 },
  { header: 'Customer', key: 'customerName', width: 22 },
  { header: 'Phone No.', key: 'phone', width: 15 },
  { header: 'Area / PIN Code', key: 'areaPin', width: 16 },
  { header: 'Article No.', key: 'articleNumber', width: 16 },
  { header: 'Order Items', key: 'items', width: 32 },
  { header: 'Amount', key: 'total', width: 12 },
  { header: 'Payment', key: 'paymentLabel', width: 10 },
  { header: 'Delivery', key: 'deliveryLabel', width: 10 },
] as const;

// Center-aligned, vertically centered columns per the locked table; Customer
// and Order Items stay left-horizontal (still vertically centered, like every
// other column — Excel's rule is simpler than the PDF's: *every* column is
// vertically centered here, only the horizontal alignment varies).
const EXCEL_LEFT_COLUMNS = new Set(['customerName', 'items']);

// PHASE21_TODO.md decision #12 / Excel revision — A4 landscape, fit-to-1-
// page-wide print setup retained; report summary block (matching the PDF's)
// added above the table; header bold+centered+frozen+auto-filtered; every
// data column wrapped and vertically centered; Payment/Delivery now show the
// same locked abbreviation codes as the PDF (documented via the same legend
// text, since Excel has no print-once-on-page-1 concept the way pdfkit does
// — printed as two more rows in the summary block instead); Order Number and
// Area/PIN Code are kept (unlike the PDF) since they're genuinely useful for
// finding/filtering a specific order later, which is Excel's whole purpose.
export async function generateOrdersExcel(rows: OrderExportRow[], summary: ExportSummary): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Orders');

  sheet.pageSetup = {
    ...sheet.pageSetup,
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { top: 0.4, bottom: 0.4, left: 0.3, right: 0.3, header: 0.2, footer: 0.2 },
  };
  sheet.columns = EXCEL_COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  // Report summary — its own rows above the table, deliberately never merged
  // (merging anywhere on the sheet, including here, would risk confusing
  // Excel's row/column model even outside the table itself; plain unmerged
  // cells with text read fine for a few summary lines).
  sheet.addRow(['PASHUSEVA ORDER REPORT']).font = { bold: true, size: 14 };
  sheet.addRow([summary.dateRangeLabel]);
  if (summary.filterSummaryLine) sheet.addRow([summary.filterSummaryLine]);
  sheet.addRow([]);
  sheet.addRow([
    `Orders: ${summary.orderCount}`,
    '',
    '',
    `Total Amount: Rs. ${summary.totalAmount.toLocaleString('en-IN')}`,
  ]);
  sheet.addRow([
    `Paid: Rs. ${summary.paidAmount.toLocaleString('en-IN')}`,
    '',
    '',
    `Unpaid: Rs. ${summary.unpaidAmount.toLocaleString('en-IN')}`,
  ]);
  sheet.addRow([]);
  sheet.addRow([LEGEND_PAYMENT]).font = { size: 9, color: { argb: 'FF666666' } };
  sheet.addRow([LEGEND_DELIVERY]).font = { size: 9, color: { argb: 'FF666666' } };
  sheet.addRow([]);

  // The actual table header — added as a plain row (not via sheet.columns'
  // header shorthand, which always assumes row 1) since it now sits below
  // the summary block at a row number that varies with whether
  // filterSummaryLine is present.
  const headerRowNumber = sheet.rowCount + 1;
  const headerRow = sheet.addRow(EXCEL_COLUMNS.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  headerRow.height = 20;

  rows.forEach((row, index) => {
    const excelRow = sheet.addRow({
      sNo: index + 1,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate,
      customerName: row.customerName,
      phone: row.phones.join('\n') || '—',
      areaPin: row.pincode && row.pincode !== '—' ? `${row.area}\n${row.pincode}` : row.area,
      articleNumber: row.articleNumber,
      items: row.items.length
        ? row.items.map((i) => `${i.name} × ${i.quantity}`).join('\n')
        : '—',
      total: row.total,
      paymentLabel: PAYMENT_CODE[row.paymentStatus],
      deliveryLabel: DELIVERY_CODE[row.deliveryStatus],
    });
    excelRow.getCell('orderDate').numFmt = 'dd/mm/yyyy';
    excelRow.getCell('total').numFmt = '"₹"#,##0.00';
    // PIN must never be read as a number (would silently drop a leading
    // zero, however rare that is for a real Indian PIN) — force text format.
    excelRow.getCell('areaPin').numFmt = '@';
    excelRow.eachCell((cell, colNumber) => {
      const key = EXCEL_COLUMNS[colNumber - 1]?.key;
      cell.alignment = {
        horizontal: key && EXCEL_LEFT_COLUMNS.has(key) ? 'left' : 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });
  });

  const lastColLetter = sheet.getColumn(EXCEL_COLUMNS.length).letter;
  // Freeze/filter/print-titles are scoped to the table itself (header row
  // down), not the summary block above it — autoFilter spans the full table
  // (header through the last data row) so every column's dropdown actually
  // filters the data, not just the header row.
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  sheet.autoFilter = `A${headerRowNumber}:${lastColLetter}${sheet.rowCount}`;
  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// PDF, later revision (superseding the "Order Name" + fixed-2-line-row design
// this section originally had): no Order Number/Area columns — a running
// S.No. (1, 2, 3…, reset per report, never the DB id) replaces Order Number
// as the row identifier, and Items is no longer capped at 2 lines with a "+N"
// marker — every item prints, one per line, so row height is now *per-row
// variable* (driven by whichever of Customer(≤2)/Phone(≤2)/Items(uncapped)
// needs the most lines) rather than fixed. Excel (above) keeps Order Number
// and Area/PIN Code — genuinely useful for finding/filtering a specific order
// later, which is Excel's whole purpose, unlike this print-only report.
const PDF_COLUMN_LABELS = [
  'S.No.',
  'Date',
  'Customer',
  'Phone No.',
  'Article No.',
  'Order Items',
  'Amount',
  'Payment',
  'Delivery',
] as const;

// Alignment per the locked table — S.No./Date/Article No./Amount/Payment/
// Delivery are centered both horizontally and vertically (see drawCentered/
// drawPhoneCentered below); Customer/Order Items stay left-aligned and
// top-aligned, natural for multi-line text read top-to-bottom (see
// drawWrapped/drawItems). Encoded directly by which draw function each column
// below calls, not a separate lookup table.
const PDF_MARGIN = 30;
const PDF_COLUMNS = [
  { key: 'sNo', width: 32 },
  { key: 'orderDate', width: 50 },
  { key: 'customerName', width: 130 },
  { key: 'phone', width: 75 },
  { key: 'articleNumber', width: 78 },
  { key: 'items', width: 200 },
  { key: 'total', width: 55 },
  { key: 'paymentLabel', width: 55 },
  { key: 'deliveryLabel', width: 60 },
] as const;

const FONT_SIZE = 9;
const LINE_HEIGHT = 11;
const ROW_PADDING = 6; // blank space below content, before the separator line

const ONE_LINE_TEXT_OPTIONS = { ellipsis: true, lineBreak: false, height: LINE_HEIGHT } as const;

function columnX(index: number) {
  let x = PDF_MARGIN;
  for (let i = 0; i < index; i++) x += PDF_COLUMNS[i].width;
  return x;
}

function tableRight() {
  return columnX(PDF_COLUMNS.length - 1) + PDF_COLUMNS[PDF_COLUMNS.length - 1].width;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  doc.font('Helvetica-Bold').fontSize(FONT_SIZE);
  PDF_COLUMNS.forEach((col, i) => {
    // Header text can stay centered regardless of that column's data
    // alignment — it's still readable/expected either way, per instruction.
    doc.text(PDF_COLUMN_LABELS[i], columnX(i), y, {
      width: col.width,
      align: 'center',
      ...ONE_LINE_TEXT_OPTIONS,
    });
  });
  doc.moveTo(PDF_MARGIN, y + LINE_HEIGHT + 3).lineTo(tableRight(), y + LINE_HEIGHT + 3).stroke();
  doc.font('Helvetica').fontSize(FONT_SIZE);
}

// Printed once, directly under the summary block (page 1 only, same as the
// summary itself) — documents every abbreviation used in the Payment/Delivery
// columns so the compact codes are never ambiguous on a printed page with no
// way to hover for a tooltip.
function drawLegend(doc: PDFKit.PDFDocument) {
  doc.font('Helvetica').fontSize(7.5).fillColor('#555555').text(LEGEND_PAYMENT, PDF_MARGIN, doc.y);
  doc.text(LEGEND_DELIVERY, PDF_MARGIN, doc.y);
  doc.fillColor('black').fontSize(FONT_SIZE);
}

// pdfkit has no way to measure "how many lines would this wrap to" directly —
// heightOfString gives the wrapped height for an unconstrained line count, so
// dividing by LINE_HEIGHT recovers the line count. Used only to size the row
// (Customer is still capped at 2 lines when actually drawn, via drawWrapped).
function estimateLineCount(doc: PDFKit.PDFDocument, text: string, width: number, maxLines: number) {
  if (!text) return 1;
  const h = doc.heightOfString(text, { width });
  return Math.min(Math.max(Math.round(h / LINE_HEIGHT), 1), maxLines);
}

// One item per line, uncapped — the whole point of this revision is that
// items are never hidden behind a "+N items" marker. Drawn as N separate
// single-line calls (not one wrapped block) so the line count is always
// exactly items.length, matching the row-height calculation exactly — a
// single very-long item name ellipsizes on its own line rather than wrapping
// and silently changing how many lines the row actually needs.
function drawItems(doc: PDFKit.PDFDocument, items: { name: string; quantity: number }[], x: number, y: number, width: number) {
  if (items.length === 0) {
    doc.text('—', x, y, { width, ...ONE_LINE_TEXT_OPTIONS });
    return;
  }
  items.forEach((item, i) => {
    doc.text(`${item.name} ×${item.quantity}`, x, y + i * LINE_HEIGHT, {
      width,
      ellipsis: true,
      lineBreak: false,
      height: LINE_HEIGHT,
    });
  });
}

// Customer name: wraps naturally up to 2 lines, ellipsis only if even 2 lines
// isn't enough — top-aligned (left-aligned columns read top-to-bottom, no
// vertical centering).
function drawWrapped(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, maxLines: number) {
  doc.text(text, x, y, { width, ellipsis: true, height: LINE_HEIGHT * maxLines });
}

// Phone: 1 or 2 numbers, each its own line — per instruction this whole block
// is centered (both horizontally and vertically) within the row, unlike
// Customer/Items which stay top-aligned.
function drawPhoneCentered(doc: PDFKit.PDFDocument, phones: string[], x: number, y: number, width: number, rowHeight: number) {
  const lines = Math.max(phones.length, 1);
  const blockHeight = lines * LINE_HEIGHT;
  const yOffset = y + (rowHeight - blockHeight) / 2;
  doc.text(phones.length ? phones.join('\n') : '—', x, yOffset, {
    width,
    align: 'center',
    ellipsis: true,
    height: blockHeight,
  });
}

// Every other centered column (S.No./Date/Article No./Amount/Payment/
// Delivery) is a single line, centered both ways within the row.
function drawCentered(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, rowHeight: number) {
  const yOffset = y + (rowHeight - LINE_HEIGHT) / 2;
  doc.text(text, x, yOffset, { width, align: 'center', ellipsis: true, lineBreak: false, height: LINE_HEIGHT });
}

// PHASE21_TODO.md decision #13 — pdfkit has no built-in "repeat header per
// page" the way exceljs's printTitlesRow does, so this is done by hand: track
// y as rows are drawn, start a new page and redraw the header before it would
// overflow. The summary block and legend are drawn once, page 1 only, above
// the table.
export function generateOrdersPdf(rows: OrderExportRow[], summary: ExportSummary): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: PDF_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageBottom = doc.page.height - PDF_MARGIN;

    doc.font('Helvetica-Bold').fontSize(16).text('PASHUSEVA – ORDER REPORT', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).text(summary.dateRangeLabel, { align: 'center' });
    if (summary.filterSummaryLine) {
      doc.text(summary.filterSummaryLine, { align: 'center' });
    }
    doc.moveDown(0.5);

    // "Rs." not "₹" — pdfkit's standard fonts (Helvetica etc.) are WinAnsi/Latin-1
    // only and have no ₹ glyph (it silently renders as a garbled character, not an
    // error) — same workaround parcelSummary.service.ts already uses for this
    // exact reason. Excel has no such limitation (see numFmt above), so it keeps
    // the real ₹ symbol.
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(
      `Orders: ${summary.orderCount}        Total Amount: Rs. ${summary.totalAmount.toLocaleString('en-IN')}`
    );
    doc.text(
      `Paid: Rs. ${summary.paidAmount.toLocaleString('en-IN')}        Unpaid: Rs. ${summary.unpaidAmount.toLocaleString('en-IN')}`
    );
    doc.moveDown(0.4);
    drawLegend(doc);
    doc.moveDown(0.5);

    let y = doc.y;
    drawTableHeader(doc, y);
    y += LINE_HEIGHT + 3 + 4;

    rows.forEach((row, index) => {
      const customerLines = estimateLineCount(doc, row.customerName, PDF_COLUMNS[2].width, 2);
      const phoneLines = Math.max(row.phones.length, 1);
      const itemLines = Math.max(row.items.length, 1);
      const rowHeight = Math.max(customerLines, phoneLines, itemLines, 1) * LINE_HEIGHT;

      if (y + rowHeight > pageBottom) {
        doc.addPage();
        y = PDF_MARGIN;
        drawTableHeader(doc, y);
        y += LINE_HEIGHT + 3 + 4;
      }

      const sNo = String(index + 1);
      drawCentered(doc, sNo, columnX(0), y, PDF_COLUMNS[0].width, rowHeight);
      drawCentered(doc, formatDateDDMMYYYY(row.orderDate), columnX(1), y, PDF_COLUMNS[1].width, rowHeight);
      drawWrapped(doc, row.customerName, columnX(2), y, PDF_COLUMNS[2].width, 2);
      drawPhoneCentered(doc, row.phones, columnX(3), y, PDF_COLUMNS[3].width, rowHeight);
      // Article No. — kept to one line at a slightly smaller font rather than
      // wrapped, per the request: it's a tracking identifier, most useful intact.
      doc.fontSize(8);
      drawCentered(doc, row.articleNumber, columnX(4), y, PDF_COLUMNS[4].width, rowHeight);
      doc.fontSize(FONT_SIZE);
      drawItems(doc, row.items, columnX(5), y, PDF_COLUMNS[5].width);
      drawCentered(doc, `Rs. ${row.total.toLocaleString('en-IN')}`, columnX(6), y, PDF_COLUMNS[6].width, rowHeight);
      drawCentered(doc, PAYMENT_CODE[row.paymentStatus], columnX(7), y, PDF_COLUMNS[7].width, rowHeight);
      drawCentered(doc, DELIVERY_CODE[row.deliveryStatus], columnX(8), y, PDF_COLUMNS[8].width, rowHeight);

      doc
        .strokeColor('#dddddd')
        .moveTo(PDF_MARGIN, y + rowHeight + ROW_PADDING / 2)
        .lineTo(tableRight(), y + rowHeight + ROW_PADDING / 2)
        .stroke()
        .strokeColor('black');
      y += rowHeight + ROW_PADDING;
    });

    doc.end();
  });
}
