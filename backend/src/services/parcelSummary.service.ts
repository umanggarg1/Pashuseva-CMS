import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { paymentRepository } from '../repositories/payment.repository';
import { PARCEL_SETTINGS } from '../constants/parcelSettings';
import type { orderRepository } from '../repositories/order.repository';

// pdfkit's built-in fonts have no Devanagari glyphs, so the Hindi return-policy note
// needs a font that does. This is the Windows system font (dev-machine only) — it is
// NOT licensed for redistribution, so it can't be bundled into the repo. If this ever
// runs on a non-Windows host, this path won't exist and the Hindi line is silently
// skipped rather than crashing PDF generation; swap in an open-licensed Devanagari
// font (e.g. Noto Sans Devanagari) at that point.
const HINDI_FONT_PATH = 'C:\\Windows\\Fonts\\Nirmala.ttf';
const HINDI_NOTE =
  'नोट: पार्सल वापस करने से पहले भेजने वाले से कन्फर्म कर लें। अगर पार्सल पोस्टमैन की गलती से वापस होता है, तो उसका जिम्मेदार पोस्टमैन होगा।';

type OrderWithDetails = NonNullable<Awaited<ReturnType<typeof orderRepository.findById>>>;

// Only G/KG are a mass unit here — ML/L are volume, so a product priced/packaged by
// volume has nothing meaningful to contribute to a shipment's total weight.
function gramsFor(item: OrderWithDetails['items'][number]) {
  const weightValue = item.product?.weightValue;
  const weightUnit = item.product?.weightUnit;
  if (!weightValue || !weightUnit) return 0;
  if (weightUnit === 'KG') return weightValue * 1000 * item.quantity;
  if (weightUnit === 'G') return weightValue * item.quantity;
  return 0;
}

function formatDate(date: Date) {
  return new Date(date)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();
}

function hr(doc: PDFKit.PDFDocument) {
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5);
}

// Pulls everything from the Order/Customer/Product records already loaded onto
// `order` (see orderRepository.findById) plus the fixed PARCEL_SETTINGS business
// details — nothing here is manually entered at print time.
export async function generateParcelSummaryPdf(order: OrderWithDetails): Promise<Buffer> {
  const paid = await paymentRepository.sumForOrder(order.id);
  const due = Math.max(order.total - paid, 0);

  // paymentStatus is the derived source of truth (never set directly — Phase 13), so
  // branch on that rather than re-deriving Paid/Partial/Unpaid from `due` here.
  let paymentLine: string;
  let amountLine: string | null = null;
  if (order.paymentStatus === 'PAID') {
    paymentLine = 'PAID';
  } else if (order.paymentStatus === 'PARTIAL') {
    paymentLine = 'PARTIALLY PAID';
    amountLine = `DUE: Rs. ${due.toLocaleString('en-IN')}`;
  } else {
    paymentLine = 'CASH ON DELIVERY';
    amountLine = `COD AMOUNT: Rs. ${due.toLocaleString('en-IN')}`;
  }

  const address = order.address;
  // Every phone on file, primary first — a courier may need an alternate number if
  // the primary one doesn't answer.
  const phones = [...order.customer.phones].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const totalWeightGrams = order.items.reduce((sum, item) => sum + gramsFor(item), 0);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const hindiFontAvailable = fs.existsSync(HINDI_FONT_PATH);
    if (hindiFontAvailable) doc.registerFont('Hindi', HINDI_FONT_PATH);

    doc.fontSize(24).font('Helvetica-Bold').text(PARCEL_SETTINGS.brandName, { align: 'center' });
    doc.fontSize(11).font('Helvetica').text(PARCEL_SETTINGS.category, { align: 'center' });
    doc.moveDown(0.5);
    hr(doc);

    doc.fontSize(13).font('Helvetica-Bold');
    doc.text(`ORDER ID: ${order.orderNumber}`);
    doc.text(`DATE: ${formatDate(order.orderDate)}`);
    doc.text(`PAYMENT: ${paymentLine}`);
    doc.moveDown(0.75);

    doc.fontSize(14).font('Helvetica-Bold').text('DELIVER TO', { underline: true });
    doc.moveDown(0.25);
    doc.fontSize(13);
    doc.text(order.customer.name.toUpperCase());
    doc.font('Helvetica').fontSize(12);
    if (address) {
      doc.text(address.addressLine.toUpperCase());
      if (address.landmark) doc.text(`LANDMARK: ${address.landmark.toUpperCase()}`);
      doc.text(
        `${address.city.toUpperCase()}${address.district ? `, ${address.district.toUpperCase()}` : ''}`
      );
      doc.text(`${address.state.toUpperCase()} - PIN: ${address.pincode}`);
    } else {
      doc.text('No delivery address on file.');
    }
    if (phones.length > 0) doc.text(`PHONE: ${phones.map((p) => p.phone).join(', ')}`);
    doc.moveDown(0.75);

    if (amountLine) {
      doc.fontSize(15).font('Helvetica-Bold').text(amountLine);
      doc.moveDown(0.5);
    }

    doc.fontSize(14).font('Helvetica-Bold').text('ITEMS');
    doc.font('Helvetica').fontSize(12);
    for (const item of order.items) {
      doc.text(`${item.productName}    x${item.quantity}`);
    }
    if (totalWeightGrams > 0) {
      const display =
        totalWeightGrams >= 1000
          ? `${(totalWeightGrams / 1000).toFixed(2)} KG`
          : `${totalWeightGrams} G`;
      doc.moveDown(0.25);
      doc.font('Helvetica-Bold').text(`TOTAL WEIGHT: ${display}`);
    }
    doc.moveDown(0.75);
    hr(doc);

    doc.fontSize(14).font('Helvetica-Bold').text('RETURN TO');
    doc.font('Helvetica').fontSize(12);
    doc.text(PARCEL_SETTINGS.businessName);
    doc.text(`Phone: ${PARCEL_SETTINGS.phones.join(', ')}`);
    doc.text(`PIN: ${PARCEL_SETTINGS.pincode} (${PARCEL_SETTINGS.state})`);
    doc.moveDown(0.25);
    doc
      .font('Helvetica-Bold')
      .text(`CONTRACT ID: ${PARCEL_SETTINGS.contractId}    BILLER ID: ${PARCEL_SETTINGS.billerId}`);
    doc.moveDown(0.75);
    hr(doc);

    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').text('PLEASE DELIVER IT IMMEDIATELY', { align: 'center' });
    doc.text('RETURN IF NOT DELIVERED', { align: 'center' });

    if (hindiFontAvailable) {
      doc.moveDown(0.5);
      doc.font('Hindi').fontSize(11).text(HINDI_NOTE, { align: 'center' });
    }

    doc.end();
  });
}
