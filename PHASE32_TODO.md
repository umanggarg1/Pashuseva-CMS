# Phase 32 — WhatsApp Automation (order confirmation + dispatch notification)

**Progress: A0 · A1 · A2 · A3 · B0 · B1 · B2 · B3 · B4 done (all local; nothing pushed, no deploy; 0 real WhatsApp requests). B6 Hindi wording approved. Q17 + Q18 implemented (§20). B5 · B7 · C2 · C3 · B8–B11 · C1 done: records created inside order creation/reorder/dispatch, sent by the worker (verified only against a fake local Meta server / dry-run; 0 real requests). Migration revised to all-or-nothing (`BEGIN … COMMIT`) and re-verified (A3-R). Next: backend implementation B and C + tests. A4 not started; nothing pushed; the migration must not be pushed before A4.**

**Status: FROZEN — FINAL ARCHITECTURE (2026-11-24). Decisions Q1–Q15 made (§16), Q3 updated by the user on 2026-11-24 (existing customers → consent YES via the backfill), Q16 decided NO (no messages for orders created before go-live). Failure-scenario review 2 resolved (§19). No code written yet. Implementation starts at A0 (read-only inspection) only when the user says START.**

**Existing database is preserved (user, 2026-11-24).** Phase 32 only **adds** to the
current PashuSeva database. Customers, names, phone numbers, products, inventory,
orders, payments, delivery records and history, and staff/user accounts are all kept
as they are. Changes go in through **additive Prisma migrations only**:
- **never** `prisma migrate reset`
- **never** `prisma migrate dev` or a seed against production
- **never** drop or rename existing tables or columns

Local Docker PG and production Neon are **separate**: testing a migration locally
changes nothing in production. Production is migrated only in the controlled step A4.

**Development rules (user, 2026-11-24):**
- Implement in the order of the §18 checklist: **database and backend tests before
  frontend integration**.
- **WhatsApp stays disabled in production** (`WHATSAPP_ENABLED=false`) until the full
  §18 E test suite (E1–E41) passes **and** the Meta test-number check (E21) passes.

**Consent decision is frozen:** WhatsApp consent is a single **YES / NO** field on the
customer, recorded by staff. No OTP, SMS, IVR, customer verification screen or any
extra consent step (§6). **Don't expand it** unless a real technical or regulatory
requirement makes it necessary. **Default on new customers = YES – Customer agreed
(preselected), decided 2026-11-24.** Staff can switch it to NO before saving.

**Language rules are frozen (user, 2026-11-24):** the CRM stays in English. The
WhatsApp message language is a per-customer setting (English default / Hindi) that
only picks which approved Meta template is used. **Customer names, product names,
order numbers, quantities, units and amounts are never translated or
transliterated.** They're sent exactly as stored in the CRM, in English, in both
languages (§4.3).

---

## 0. End-to-end flow (what staff and the customer experience)

1. Staff open **Create Order**, select the customer (or create one inline), products,
   quantities, payment, and click **Create Order**.
2. The backend creates the order. The **idempotency key** prevents a duplicate order
   on a double-click, retry or refresh (§8, §19.2).
3. **In the same database transaction**, an `ORDER_CREATED` message row is created.
   If the order fails, the message row disappears with it.
4. **Eligibility at enqueue:** WhatsApp number present and valid, consent YES,
   feature enabled. If not, the row is saved as **SKIPPED with the reason**.
5. If eligible, the row is **QUEUED**. After the order is saved, a worker sends the
   approved template through Meta (re-checking consent, recipient, order and
   customer immediately before the call, §9.2).
6. The status is updated: **SENT** (Meta accepted) → **DELIVERED** → **READ**, or
   RETRY_WAIT / FAILED / UNKNOWN / SKIPPED. Staff see it on the order (§0.1).
7. Later, when the order's delivery status goes **Not Dispatched → Dispatched**, a
   separate **dispatch notification** is created and sent the same way, with
   products, prices, payment details and the 5–7 day estimate.

**The order is always created**, even if WhatsApp is disabled, Meta is down, or the
message fails. Messaging never interrupts order creation.

### 0.1 How staff know whether a message was sent

**Right after saving** (Create Order and Reorder): the success toast shows two
separate lines, because they're two separate outcomes:
- **Order saved**: ORD-…
- **WhatsApp:** `Queued for sending` / `Not sent: <reason>` (e.g. "No WhatsApp
  consent", "No WhatsApp number", "WhatsApp disabled")

The order API response includes `whatsapp: { status, skipReason }` for this. A
failure that happens *after* saving (Meta rejects it a few seconds later) shows up
in the order's WhatsApp card below.

**Order Details → WhatsApp messages card**: one row per message, showing the type
(Order confirmation / Dispatch notification / Resend), the number (masked
`98XXXX3210`), language, status chip, time, the reason for FAILED/SKIPPED, who
triggered it, and "resend of #…". It refreshes every 10 s while any message is
still active (QUEUED / PROCESSING / RETRY_WAIT / SENT). Each status chip has a
one-line explanation (tooltip / help text, in English like the rest of the CRM):

| Status | Shown to staff as |
|---|---|
| QUEUED | Waiting to be sent |
| PROCESSING | Sending now |
| RETRY_WAIT | Temporary problem, will retry automatically at <time> |
| SENT | Accepted by WhatsApp, **not yet delivered** |
| DELIVERED | Delivered to the customer's WhatsApp |
| READ | Read by the customer |
| FAILED | Could not be sent: <reason> |
| UNKNOWN | Not confirmed whether it was sent; an Admin will check (shown in Needs attention) |
| SKIPPED | Not sent: <reason> |

SENT ≠ delivered: the help text says so explicitly. Authorised staff can **Resend**
from this card (§13). UNKNOWN and FAILED also appear in the Admin **Needs attention**
list (D6).

---

## 1. Scope

| # | Feature | Trigger | Content |
|---|---|---|---|
| 1 | **Order confirmation** (automatic) | Order successfully created | Short, general: name, order number, product names (+ qty). **No prices, payment or delivery dates.** |
| 2 | **Dispatch notification** (automatic) | Order **transitions** Not Dispatched → Dispatched | Detailed: products, qty, prices, total, payment method/status, amount paid / to pay, estimated delivery (5–7 days, clearly an estimate) |
| 3 | **Message tracking** (both) | — | Queued / Processing / Retry wait / Sent / Delivered / Read / Failed / Unknown / Skipped, plus a manual **Resend** |
| 4 | **Language** | — | English + Hindi, separate approved templates, chosen by the customer's language preference |
| 5 | **Customer phones** | — | A **WhatsApp** flag on any phone (primary or alternate), independent of Primary, plus **WhatsApp Consent: YES (customer agreed) / NO (customer declined)** per customer. Only YES allows messages |

Lifecycle:

```
Order Created ──► ORDER_CONFIRMATION (auto)
Processing    ──► (no message this phase)
Dispatched    ──► ORDER_DISPATCHED (auto, only on the real transition)
Delivered     ──► (no message this phase — future)
Cancelled     ──► (no message this phase — future; queued messages for it are skipped)
```

Not in this phase: delivered / cancelled / payment-reminder messages, two-way chat
inbox, SMS/email fallback, partial shipments (the CRM has no partial-dispatch concept,
since an order is dispatched as a whole).

---

## 2. Facts from the current code that this design relies on

| Fact | Where | Consequence |
|---|---|---|
| `CustomerPhone { phone, label, isPrimary }`, no format check | `schema.prisma`, `customer.schema.ts` | Add `isWhatsapp`; validate format only when flagged |
| Order creation = one `prisma.$transaction` (15 s timeout) | `order.service.ts` `create` | Confirmation row created inside it; the Meta call happens **after commit** |
| **Every** dispatch path goes through `applyDeliveryStatusChange`: manual delivery-status PATCH **and** auto-dispatch on the first Article No. (Phase 22) | `order.service.ts` | A single hook point for the dispatch message |
| Not Dispatched can only go to Dispatched (Phase 24). Re-logging the same status (e.g. DISPATCHED with a new location) is allowed. **Admin/Manager can move backward** | `updateDeliveryStatus`, `assertNotBackwardDelivery` | The trigger must be `old === NOT_DISPATCHED && new === DISPATCHED`, plus a re-dispatch policy (§7) |
| `OrderItem` stores `productName`, `productSKU`, `unit`, `quantity`, `unitPrice`, `discount`, `totalPrice` | `schema.prisma` | Item snapshot already exists, so catalogue renames/price changes never leak in |
| Payment truth = `Payment` rows (with reversals); `paymentStatus` is derived (`PENDING/PARTIAL/PAID/REFUNDED`) | `paidStatusFor` | Message amounts are computed from `SUM(payments)`, never inferred from the method |
| `PaymentMethod` = CASH/UPI/BANK_TRANSFER/CARD/ONLINE/OTHER, with no "COD" value | enum | "Cash on Delivery" is shown when an **amount is still due**, the same rule the parcel label uses |
| No idempotency on `POST /orders`. The frontend only disables the button while pending | `CreateOrder.tsx:567` | Add a real idempotency key (§8) |
| Permissions are string keys in `permission.schema.ts` + per-user grants | `UserPermission` | New keys `message:resend`, `message:manage` |
| Orders/customers soft-delete to Trash; customer purge anonymizes | `trash.service.ts` | Eligibility re-check at send time; purge scrubs message PII |
| Backend runs on Render (may restart/sleep/scale), DB on Neon | PHASE29 | Queue in Postgres with atomic claiming; recovery after restart |

---

## 3. WhatsApp template constraint (important — this changes the suggested layout)

Meta template **variables cannot contain line breaks, tabs, or more than 4 spaces in a
row**, and a variable can't be empty. Only the template's own fixed text can have line
breaks. So a variable-length product table or bullet list **cannot** be sent as rows.

Chosen approach: **one variable holds all items on a single line**, separated by `  |  `
(within the 4-space rule). If it gets too long (~700 chars for the body overall,
1024 is Meta's limit), it's cut with "… +N more items". Fixed labels, emojis and line
breaks live in the template text.

Rejected: fixed "item slots" ({{3}}..{{12}}), since empty variables aren't allowed and
it would need a template per item count. Also rejected: sending the table as an image
or PDF, which is too heavy for this phase (a possible later option: attach the invoice
PDF as a document header).

---

## 4. Templates (4 to get approved: 2 types × 2 languages, category **Utility**)

Names: `ps_order_confirmation` and `ps_order_dispatched`, each in `en` and `hi`.
Header: text **PashuSeva** (fixed). Footer: fixed text, max 60 chars.

### 4.1 `ps_order_confirmation` — en
```
Header: PashuSeva
Body:
Namaste {{1}} ji! 🙏

Thank you for placing your order with PashuSeva.

Your order {{2}} has been successfully received.

Your ordered products:
{{3}}

We are processing your order and will notify you once it is dispatched.

Thank you for choosing PashuSeva! ❤️
Footer: Order confirmation
```
| Var | Value | Example |
|---|---|---|
| {{1}} | customer name | Rahul |
| {{2}} | `order.orderNumber` | ORD-2026-000125 |
| {{3}} | items: `productName × qty unit`, joined with `  \|  ` (unit only if the item has one; English plural, §4.3) | Satvik Shahi Mixer Feed × 2 Bags  \|  Milk Booster Powder × 1 Packet |

### 4.2 `ps_order_dispatched` — en
```
Header: PashuSeva
Body:
Namaste {{1}} ji! 🙏

Good news! Your PashuSeva order {{2}} has been dispatched. 🚚

Order details:
{{3}}

Order summary
• Total amount: ₹{{4}}
• Payment method: {{5}}
• Payment status: {{6}}
• {{7}}
• Tracking number: {{8}}

Expected delivery: approximately 5–7 days from dispatch (estimate, not guaranteed).

Please keep your phone available for delivery updates.

Thank you for choosing PashuSeva! ❤️
Footer: Dispatch notification
```
| Var | Value |
|---|---|
| {{1}} | customer name |
| {{2}} | order number |
| {{3}} | items: `productName × qty unit – ₹lineTotal`, joined with `  \|  ` (from `OrderItem` snapshot; names/units always English, §4.3) |
| {{4}} | `order.total` formatted `1,250` |
| {{5}} | see payment table below |
| {{6}} | see payment table below |
| {{7}} | see payment table below (a whole line, so the label can change) |
| {{8}} | Article No. if set, else `Will be shared soon` *(decided, Q7)* |

Payment wording comes **only** from the central `getOrderPaymentSummary()` (§19.6).
The template builder, the resend preview and the parcel label all call it, and none
of them calculate amounts themselves. `paid` = SUM of all `Payment` rows (reversals
are negative rows), `due = max(total − paid, 0)`.

| Situation (from the summary) | {{5}} Payment method | {{6}} Payment status | {{7}} |
|---|---|---|---|
| total > 0, paid = 0 | Cash on Delivery | Unpaid | Amount to pay on delivery: ₹1,250 |
| 0 < paid < total | Part prepaid, balance due on delivery | Partially paid | Paid ₹500, balance due on delivery: ₹750 |
| paid ≥ total, total > 0 | Prepaid | Paid | Amount paid: ₹1,250 |
| total = 0 (Phase 31 free) | Free order | Paid | Nothing to pay |
| status REFUNDED (unreachable today, defensive) | — | Refunded | Please contact us for payment details |

**{{5}} Payment method wording, decided (Q12, user 2026-11-24).** These exact
strings go in `templates/i18n.ts`:

| Payment situation | English template | Hindi template |
|---|---|---|
| Nothing paid | Cash on Delivery | कैश ऑन डिलीवरी |
| Part payment | Part prepaid, balance due on delivery | कुछ एडवांस, बाकी डिलीवरी पर। |
| Fully paid | Prepaid | पूरा भुगतान हो चुका है |
| Free order | Free order | निःशुल्क ऑर्डर |

This matches the parcel label the courier collects against (`COD AMOUNT` / `DUE`).
The Hindi strings for {{6}}, {{7}} and {{8}} are drafted in B6 and approved by you
along with the Hindi template text. The amounts inside them stay as numbers (₹).

### 4.3 Language rules (frozen) and Hindi (`hi`)

**How the language is chosen:** each customer has **WhatsApp Message Language**
(`English` default / `Hindi`), a dropdown in Add Customer, in the inline new
customer on Create Order, and in Customer Details (edit). It only selects which
approved template (`en` / `hi`) is used. The CRM itself stays in English. Nothing is
translated at send time, and if the Hindi template isn't approved the English one is
used (Q6).

| Message element | English message | Hindi message |
|---|---|---|
| Fixed template text (greeting, labels, thank-you) | English | Hindi (approved template) |
| **Customer name** | as stored (English) | **as stored (English), no transliteration** |
| **Product names** | as stored in the product catalogue (English) | **same English names, never translated** |
| Order number, Article No. | unchanged | unchanged |
| Quantity + unit | `× 2 Bags` | **`× 2 Bags` (English)** |
| Amounts | ₹1,250 | ₹1,250 |
| Payment wording ({{5}}–{{7}}) | English strings | Hindi strings (fixed set in `i18n.ts`) |
| Tracking fallback ({{8}}) | "Will be shared soon" | Hindi string |

**Units:** `OrderItem.unit` comes from the product's `PackagingUnit`
(PIECE/PACKET/BOX/BAG/BOTTLE). It's rendered in English, singular/plural by quantity
(Piece(s), Packet(s), Box(es), Bag(s), Bottle(s)), in both languages. No unit →
just `× 2`.

Example `ps_order_confirmation` / `hi` (illustrative; the final Hindi wording is
approved by you in B6 before submission to Meta):
```
Header: पशुसेवा
Body:
नमस्ते {{1}} जी! 🙏

आपका ऑर्डर {{2}} सफलतापूर्वक बुक हो गया है।

आपके ऑर्डर में शामिल उत्पाद:
{{3}}

ऑर्डर भेजे जाने पर हम आपको सूचित करेंगे।

पशुसेवा चुनने के लिए धन्यवाद! ❤️
```
Rendered: "नमस्ते **Ram Lal** जी! … आपका ऑर्डर **ORD-2026-001025** … **Satvik Shahi
Mixer Feed × 2 Bags  |  Milk Booster Powder × 1 Packet**". The name, products, order
number and units stay in English.

Same variables, same order as the English template. Order numbers are the CRM's real
format (`ORD-YYYY-NNNNNN`); examples elsewhere showing `PS-1025` are illustrative.

### 4.4 Template rules in code
- Builders: `buildConfirmationParams(snapshot, lang)` and
  `buildDispatchParams(snapshot, lang)`. They're pure functions, sanitize every value
  (no newline/tab, collapse spaces, never empty → fallback `-`) and enforce length.
- The builder output (`params`) is **stored on the message row at enqueue time**.
  Retries send exactly the stored params and never rebuild.
- **Template availability check:** a `MessageTemplateStatus` cache (refreshed from
  Meta every 6 h + on demand from the Admin page) records whether each name+language
  is `APPROVED`. If the customer's language template isn't approved, **fall back to
  English** (and record `fallbackFromLanguage`) *(Q6)*. If English isn't approved
  either, the row is **SKIPPED "Template not approved"** and Admin is notified.

---

## 5. Data model (one additive migration)

```prisma
enum MessageLanguage { EN HI }
enum MessageChannel  { WHATSAPP }
enum MessageType     { ORDER_CONFIRMATION ORDER_DISPATCHED }
enum MessageStatus   {
  QUEUED        // saved, waiting
  PROCESSING    // claimed by a worker, send in progress
  RETRY_WAIT    // temporary error, nextAttemptAt scheduled
  SENT          // Meta accepted (has providerMessageId)
  DELIVERED     // webhook
  READ          // webhook
  FAILED        // permanent error / retries exhausted / expired
  UNKNOWN       // Meta MAY have accepted it — never auto-retried (§9)
  SKIPPED       // not sent: no number, consent NO, disabled, ineligible, …
}
enum MessageErrorKind { TEMPORARY PERMANENT CONFIGURATION AMBIGUOUS }
enum WhatsappConsent  { YES NO }      // YES – Customer agreed, NO – Customer declined
enum ConsentSource    { STAFF CUSTOMER_STOP_REPLY BACKFILL }

model CustomerPhone {
  // … existing fields
  isWhatsapp Boolean @default(false)          // independent of isPrimary
}
//   @@unique([customerId], map: "CustomerPhone_one_whatsapp_per_customer", where: { isWhatsapp: true })
//   → native Prisma partial index (generator previewFeatures = ["partialIndexes"], verified in A0)

model Customer {
  // … existing fields
  preferredLanguage     MessageLanguage @default(EN)
  whatsappConsent       WhatsappConsent @default(NO)   // column default stays NO (safe); existing customers are set to YES by the one-time backfill A5
  whatsappConsentAt     DateTime?                      // when it was last set
  whatsappConsentById   Int?                           // staff who set it (null = customer replied STOP)
  whatsappConsentSource ConsentSource?                 // STAFF / CUSTOMER_STOP_REPLY / BACKFILL (one-time A5)
}

model Order {
  // … existing fields
  idempotencyKey  String? @unique              // §8, set by POST /orders and reorder
  idempotencyHash String?                      // sha256(acting user id + canonical request body), §19.2
}

model OutboundMessage {
  id                 Int              @id @default(autoincrement())
  eventKey           String           @unique   // §7: ORDER_CREATED:123 / ORDER_DISPATCHED:123 / RESEND:<uuid>
  channel            MessageChannel   @default(WHATSAPP)
  type               MessageType
  orderId            Int?
  customerId         Int
  resendOfId         Int?                       // original message this resends
  resendReason       String?
  requestKey         String?          @unique   // idempotency for the Resend API

  // snapshot taken at enqueue — never recomputed
  toPhone            String?                    // 91XXXXXXXXXX
  toPhoneId          Int?                       // CustomerPhone row it came from: plain Int, NO foreign key (A0: phone rows are deleted on edit)
  language           MessageLanguage
  fallbackFromLanguage MessageLanguage?
  templateName       String?
  params             Json?                      // exact variable values
  snapshot           Json?                      // items/total/payment used to build params (audit)

  status             MessageStatus    @default(QUEUED)
  skipReason         String?
  errorKind          MessageErrorKind?
  errorCode          String?                    // Meta error code
  lastError          String?

  attempts           Int              @default(0)
  maxAttempts        Int              @default(5)
  nextAttemptAt      DateTime         @default(now())
  expiresAt          DateTime                   // §10 max age
  lockedAt           DateTime?
  lockedUntil        DateTime?
  lockedBy           String?                    // instance id (RENDER_INSTANCE_ID / hostname+pid)
  claimToken         String?                    // new uuid on every claim; every worker write must match it (§19.3)
  sendStartedAt      DateTime?                  // committed right before the Meta call, reset on each claim (§19.3)
  lastAttemptAt      DateTime?

  providerMessageId  String?          @unique   // wamid
  sentAt             DateTime?
  deliveredAt        DateTime?
  readAt             DateTime?
  failedAt           DateTime?

  triggeredById      Int?                       // creator / dispatcher / resender
  resolvedById       Int?                       // who resolved an UNKNOWN
  lateResponseNote   String?                    // a Meta answer that arrived after the claim was lost (§19.3)
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  @@index([status, nextAttemptAt])
  @@index([orderId, type])
  @@index([customerId])
}

model MessageStatusEvent {                       // webhook history + dedup
  id                Int      @id @default(autoincrement())
  providerMessageId String
  status            String                       // sent/delivered/read/failed
  providerTimestamp DateTime
  errorCode         String?
  raw               Json
  messageId         Int?                         // null if unmatched
  createdAt         DateTime @default(now())

  @@unique([providerMessageId, status])
}

model MessagingState {                           // single row, id = 1
  id            Int       @id
  pausedAt      DateTime?                        // circuit breaker (§11)
  pauseReason   String?
  pausedBy      String?                          // "system" or user id
  rateLimitedUntil DateTime?                     // shared back-off after a Meta 429, honoured by every worker (§19.4)
  goLiveAt      DateTime?                        // §7.1 (Q16): set ONCE, the first time WhatsApp is enabled; never changed afterwards
}

model MessageTemplateStatus {
  name       String
  language   String
  status     String                              // APPROVED / PENDING / REJECTED / PAUSED / DISABLED
  checkedAt  DateTime
  @@id([name, language])
}
```

The migration is purely additive (columns with defaults, new tables/enums), so it's
safe for `migrate deploy` over `DIRECT_URL`.

---

## 6. Phone, recipient and consent rules

**WhatsApp flag**
- Any phone can be flagged; Primary and WhatsApp can be the same row.
- **At most one WhatsApp number per customer** *(Q1)*.
- Flagged numbers must normalize (`utils/phone.ts` `toWhatsappNumber`): strip
  spaces/`-()+`; 10 digits starting 6–9 → `91…`; `0` + 10 digits → `91…`; `91` + 10
  digits → as-is; otherwise 400 "WhatsApp number must be a valid Indian mobile
  number". The stored `phone` text is never rewritten.

**Recipient snapshot policy**
- At enqueue: `toPhone` + `toPhoneId` are copied from the customer's current
  WhatsApp number.
- At send (every attempt, including retries): re-check that phone row `toPhoneId`
  still exists, is still `isWhatsapp`, and still normalizes to the same `toPhone`.
  If not → **SKIPPED "Recipient changed before sending — use Resend"**. The message
  never goes to a number the staff has since removed, and never silently re-targets.

**WhatsApp Consent: two options only**

| Value | Label shown | Effect |
|---|---|---|
| `YES` | YES – Customer agreed | WhatsApp messages allowed |
| `NO` | NO – Customer declined | **All** WhatsApp messages blocked (automatic and Resend) |

- Staff record it on the customer. **No OTP, SMS confirmation, IVR or any extra step
  for the customer.**
- **New customer** (Add Customer dialog and inline new customer on Create Order):
  **`YES – Customer agreed` is preselected** (decided 2026-11-24). `NO – Customer
  declined` stays available, and staff can switch to NO before saving. If staff
  don't change it, YES is saved. **Staff must make sure YES reflects the customer's
  actual agreement.** The API still requires the field explicitly on create (the
  form always sends it), so no code path can save a customer without a recorded
  value.
- **Where it appears:** Add Customer (choose), Create Order with an **existing**
  customer (no field; the saved consent is used and shown in the WhatsApp hint, D3),
  Create Order with an **inline new** customer (choose, default YES), Customer
  Details (edit). It's always stored on the **customer**, never per order.
- **Existing customers (Q3, updated by the user 2026-11-24):** the migration itself
  adds the column with the safe default NO. Then the **one-time backfill (A5) sets
  every existing, non-trashed customer to `YES`**, with source `BACKFILL`, a
  timestamp, and a customer-activity entry "WhatsApp consent set to YES (one-time
  backfill, Phase 32)". This keeps it auditable and separate from staff-recorded
  consent. Staff can switch any customer to NO afterwards. **The backfill sends no
  messages** (§18 A5).
- **Every change is audited:** `whatsappConsentAt`, `whatsappConsentById`,
  `whatsappConsentSource` on the customer, **plus** a customer-activity entry that
  records the **previous value, new value, employee and timestamp** (e.g. "WhatsApp
  consent changed NO → YES by Jitender Rajput, 24 Nov 2026 14:05"; for STOP: "… YES →
  NO by customer (replied STOP)").
- **Only consent control visible to staff:** the YES/NO field. There's no separate
  opt-out toggle or Boolean anywhere (UI, API or DB).
- **Checked at enqueue and again before every send attempt, retry and resend.** NO
  → **SKIPPED "No WhatsApp consent"**. Changing YES → NO while a message is queued
  stops it.
- **STOP reply:** if a customer replies "STOP" / "रोकें" / "बंद" on WhatsApp, consent is
  set to **NO** automatically (source `CUSTOMER_STOP_REPLY`). Meta requires
  businesses to honour opt-out requests; this is not an extra step for the customer
  *(Q8)*. Staff can set it back to YES only if the customer agrees again.
- Consent is per customer, not per phone. The WhatsApp flag (above) says *which*
  number; consent says *whether* to message at all.

**No WhatsApp number** → SKIPPED "No WhatsApp number" (the order is still created).
The Create Order page warns about this beforehand (D3).

---

## 7. Triggers and event identity (one logical event = one initial message)

`eventKey` is **unique in the database**. The insert uses
`INSERT … ON CONFLICT (eventKey) DO NOTHING`, so double requests, concurrent
dispatches, or retried API calls can never produce a second row.

| Event | eventKey | Created where |
|---|---|---|
| Order created | `ORDER_CREATED:<orderId>` | inside `orderService.create`'s transaction (both existing-customer and inline-new-customer paths) |
| Order dispatched | `ORDER_DISPATCHED:<orderId>` | inside `applyDeliveryStatusChange`, **only when** `existing.deliveryStatus === 'NOT_DISPATCHED' && data.deliveryStatus === 'DISPATCHED'` |
| Manual resend | `RESEND:<uuid>` (+ `resendOfId`) | Resend API |

What does **not** trigger:
- Re-logging DISPATCHED (new location/note), later statuses (In Transit…), editing an
  already-dispatched order, Article No. edits after the first one, payment changes.
- **Re-dispatch after an Admin/Manager correction** (Dispatched → Not Dispatched →
  Dispatched): the key `ORDER_DISPATCHED:<orderId>` already exists, so no second
  automatic message. An activity note says "Dispatch notification not re-sent
  automatically (already sent for this order) — use Resend if needed" *(Q5)*.
- Two employees dispatching at the same moment: the second hits either the existing
  transition check or the unique key. Exactly one message.

### 7.1 Go-live rule (Q16 = NO)

- **Go-live** = the first time the app starts with `WHATSAPP_ENABLED=true` (provider
  `meta`). On that start, `MessagingState.goLiveAt` is set with
  `UPDATE … SET "goLiveAt" = now() WHERE id = 1 AND "goLiveAt" IS NULL`. It's set
  **once** and never moved by later restarts or a disable/re-enable. The dry-run
  provider never sets it.
- **An order is eligible for WhatsApp only if `order.createdAt >= goLiveAt`**
  (`goLiveAt` not set → no order is eligible). This applies to:
  - **Dispatch notification:** on the Not Dispatched → Dispatched transition of an
    ineligible order, a row is still written as **SKIPPED "Order created before
    WhatsApp go-live"**, so staff can see why nothing was sent. No Meta call is ever
    made.
  - **Order confirmation:** orders created while WhatsApp is disabled (e.g. between
    the A4 production migration and go-live) are already SKIPPED "WhatsApp
    disabled". Once `goLiveAt` is set, they're older than it, so they stay ineligible
    for any later message too.
  - **Manual Resend:** blocked for ineligible orders ("Order created before WhatsApp
    go-live"), so no retroactive message can be sent by hand either.
- Checked at enqueue **and** again in the pre-send checks (§9.2), like every other
  eligibility rule.
- **Nothing about existing orders changes:** no order, delivery status, tracking or
  history row is modified. The backfill (A5) only touches customer consent and phone
  flags.

Order of messages: the worker does not claim an `ORDER_DISPATCHED` row while that
order's `ORDER_CONFIRMATION` is still QUEUED/PROCESSING/RETRY_WAIT (waits up to
10 min, then sends anyway). This stops "dispatched" arriving before "confirmed" when an
order is created and dispatched within seconds. If the confirmation ends **FAILED,
SKIPPED, expired or UNKNOWN**, the dispatch message is **sent normally**. It's
self-contained (order number + full details), and an UNKNOWN confirmation is never
resent automatically, so the dispatch never waits on a human. Covered by test E40.

---

## 8. Idempotency for user actions

**Repeat orders are always allowed (user, 2026-11-24, mandatory):** the same customer
can create unlimited legitimate repeat orders for the same products, quantities and
combinations. Idempotency only prevents **duplicate processing of the same
order-creation request**. It must never block a new order based on customer,
product, quantity or time.

- The key identifies **one order-creation attempt**. It's a random UUID generated
  when a new Create Order form/session starts, reused only when retrying that same
  submission, and **regenerated for every genuinely new order**.
- **Never** derived from customer ID, product ID, quantities, the source order or
  the date. There's no "same customer + same products within X minutes" check.
- **After a successful save** the key is cleared and the next order gets a fresh one,
  even if the form is reused or pre-filled with identical items.
- **A failed save** (validation error, out of stock, network error before the order
  was created) creates no order, so the key isn't consumed. Fixing the form and
  submitting again with the same key creates the order normally. If the details
  changed after a failure that never created an order, the request is processed as
  normal; the 422 mismatch applies only when an order already exists for that key.
- **Reorder:** each click of Reorder starts a new attempt with a new random key
  (generated when the Reorder confirmation opens), **not** derived from the source
  order, so reordering the same past order next week is a new order. Only a
  double-click or retry of that same Reorder confirmation is de-duplicated.
- Examples: Ram Lal orders 2 bags today → new order; the same again tomorrow, or after
  10 days → new order each time; staff accidentally submit today's form twice → one
  order. Covered by test E26b.


| Action | Protection |
|---|---|
| **Create Order** double-click / slow network / retried request | Frontend generates a UUID when the Create Order form opens and sends it as `Idempotency-Key`. Backend stores it in `Order.idempotencyKey` (unique). Same key again → returns the **already-created order** (200), no new order, no new message. The button also stays disabled while pending (already true) |
| Delivery status → Dispatched retried | Naturally idempotent: the second request sees DISPATCHED already (no transition), plus the unique eventKey |
| **Resend** double-click | `Idempotency-Key` → `OutboundMessage.requestKey` unique; and the cooldown rules in §13 |

---

## 9. Sending pipeline (queue, locking, ambiguous outcomes)

### 9.1 Claim (atomic, safe with several Render instances)
```sql
UPDATE "OutboundMessage" SET status='PROCESSING', "lockedAt"=now(),
       "lockedUntil"=now()+interval '2 minutes', "lockedBy"=$instance,
       "claimToken"=gen_random_uuid(), "sendStartedAt"=NULL,
       attempts=attempts+1, "lastAttemptAt"=now()
WHERE id IN (
  SELECT id FROM "OutboundMessage"
  WHERE status IN ('QUEUED','RETRY_WAIT') AND "nextAttemptAt" <= now()
  ORDER BY "nextAttemptAt", id LIMIT $batch
  FOR UPDATE SKIP LOCKED)
RETURNING *;
```
- `dispatch(id)` right after commit uses the same claim, filtered to that id. If the
  sweeper already took it, it gets 0 rows and does nothing.
- **Two-step write-ahead.** (1) The claim is committed. (2) Right before the
  Meta call, `sendStartedAt = now()` is committed (`WHERE id AND claimToken`). The
  database knows exactly whether Meta *may* have been called (§19.3).
- **Every worker write after the claim** is
  `UPDATE … WHERE id=$id AND status='PROCESSING' AND "claimToken"=$token`. If 0 rows
  match, the worker lost its claim (expired, recovered, reconciled by a webhook, or
  resolved by an Admin), so the stale-worker rule in §19.3 applies.
- **Lease vs work time:** lease 2 min; the Meta call has a hard 10 s AbortController
  timeout; pre-send checks are a few queries. The worker doesn't call Meta if less
  than 60 s of the lease is left (it releases back to QUEUED instead). No lease renewal
  is needed.
- **Fair queue:** the claim orders by `nextAttemptAt, id`. A row that keeps failing
  moves back by backoff, and each row is processed in its own try/catch
  (`Promise.allSettled`), so one bad row can't block the rest.

### 9.2 Pre-send checks (on the claimed row, before calling Meta)
1. Feature enabled and not paused (§11). Otherwise put it back to QUEUED, unlock, and
   stop.
2. `now() > expiresAt` → FAILED "Expired".
3. **Consent check, immediately before the Meta API call (mandatory rule):** re-read
   `Customer.whatsappConsent` **fresh from the database** in the same function that
   makes the call, after the claim and never from a cached or queued copy. Consent
   NO → **SKIPPED "No WhatsApp consent"**, with no Meta call. This applies to the
   first attempt, **every retry** and **every manual resend**. Example: consent YES →
   order created, message queued → staff set NO → worker claims it → re-check → SKIPPED.
4. Eligibility, all read fresh:
   - **go-live (Q16):** `order.createdAt >= MessagingState.goLiveAt` (unset → ineligible) (§7.1)
   - recipient: phone row `toPhoneId` exists, **belongs to `customerId`**, is still
     `isWhatsapp`, and still normalizes to `toPhone` (§6, §19.1)
   - **customer** not in Trash (`deletedAt`) and not purged (`purgedAt`)
   - **order** not in Trash, not purged
   - confirmation: order not cancelled
   - dispatch: delivery status still DISPATCHED / IN_TRANSIT / OUT_FOR_DELIVERY /
     DELIVERED and the order isn't cancelled

   Failing any of these → SKIPPED with the reason.
5. The template for the chosen language is approved (§4.4).

### 9.3 Call Meta
`POST https://graph.facebook.com/{ver}/{phoneNumberId}/messages` (built-in `fetch`,
10 s timeout), with **`biz_opaque_callback_data` = `eventKey`**. Meta echoes this back
in status webhooks, which is what makes reconciliation (§9.5) possible.

### 9.4 Classify the outcome

| Outcome | errorKind | New status |
|---|---|---|
| 200 with a **valid** `messages[0].id` (non-empty string, `wamid.` prefix) | — | **SENT**, save `providerMessageId`, `sentAt`, unlock, only if the claim still holds (§19.3) |
| **200 but body missing/malformed/no valid id** | AMBIGUOUS | **UNKNOWN** (never treated as SENT, never retried) |
| Connection failed **before** the request was sent (DNS, ECONNREFUSED) | TEMPORARY | RETRY_WAIT (backoff) |
| 429 / Meta rate-limit codes | TEMPORARY | RETRY_WAIT after `Retry-After` or backoff, **and** `MessagingState.rateLimitedUntil` is set so *every* worker pauses claiming until then (§19.4) |
| 5xx **with** a Meta error body saying "temporarily unavailable" | TEMPORARY | RETRY_WAIT |
| **Timeout / connection reset after sending / 5xx with no body / response unreadable** | AMBIGUOUS | **UNKNOWN**, never auto-retried |
| Invalid/unreachable recipient, not on WhatsApp, bad parameters | PERMANENT | FAILED (no retry) |
| Invalid/expired token, template missing/paused/disabled, account restricted/locked, payment issue, **unsupported API version** | CONFIGURATION | Row goes back to QUEUED (attempt not counted) + **circuit breaker pauses sending** (§11) + Admin notification |

The exact Meta error-code → kind mapping lives in one table in `metaErrors.ts`. It's
built from Meta's current Cloud API error-code docs at implementation time; unknown
codes default to **PERMANENT** (fail safe, never loop).

Backoff for TEMPORARY: 1 min → 5 min → 15 min → 1 h. After `maxAttempts` (5) → FAILED
"Retries exhausted".

### 9.5 UNKNOWN and crash recovery (the "Meta accepted it, CRM crashed" case)
- **Crash after Meta accepted, before saving the id:** the row is PROCESSING with an
  expired `lockedUntil`. Recovery (atomic `UPDATE … WHERE status='PROCESSING' AND
  "lockedUntil" < now()`, clearing `claimToken`):
  - `sendStartedAt` **set** → **UNKNOWN** (Meta may have been called). Never re-queued.
    This is the rule that prevents the duplicate.
  - `sendStartedAt` **null** → back to **QUEUED** (the crash happened before the
    Meta call, so retrying is provably safe).
- **Automatic reconciliation:** when a status webhook arrives for an unknown `wamid`,
  its `biz_opaque_callback_data` (= eventKey) is looked up. If it matches an UNKNOWN
  (or PROCESSING) row, the row gets the `providerMessageId`, moves to
  SENT/DELIVERED/READ, and **its `claimToken` is cleared**, so a slower API response
  from the original worker can't overwrite it (§19.5). Resolved, no duplicate.
- **Still UNKNOWN after 30 min** (no webhook arrived, so it was probably never sent):
  it appears in the Admin **Needs attention** list (and on the order's Messages
  card). An Admin chooses **"Mark as failed and resend"** (creates a resend row) or
  **"Mark as sent"**. This is recorded with `resolvedById`. Nothing resends without a
  human decision.

### 9.6 Worker runtime
- `startSweeper()` after `app.listen`, every 30 s: (1) recover expired locks →
  UNKNOWN, (2) claim up to 10 due rows, (3) send with **concurrency 3**.
- One immediate `dispatch(id)` after each enqueue commit (fire-and-forget, errors
  logged).
- SIGTERM: stop claiming, wait for in-flight sends (≤10 s, within Render's grace
  period).
- DB unavailable: the sweeper tick catches the error, logs it and tries again next
  tick. It never crashes the process.
- Render restart/sleep: QUEUED/RETRY_WAIT rows are picked up on the next start;
  `expiresAt` stops stale messages from going out days later.

---

## 10. Message expiry (max age)

| Type | `expiresAt` | Reason |
|---|---|---|
| ORDER_CONFIRMATION | created + 24 h | "We received your order" days later is confusing |
| ORDER_DISPATCHED | created + 72 h | Still useful within a few days, not after delivery |
| Resend | created + 24 h | — |

---

## 11. Feature switch and circuit breaker

- `WHATSAPP_ENABLED=false` (or missing credentials): new events are recorded as
  **SKIPPED "WhatsApp disabled"**, so history shows why. Rows that are already queued
  are **kept as they are** (not deleted, not sent) until it's re-enabled or they
  expire.
- **Circuit breaker:** a CONFIGURATION error sets `MessagingState.pausedAt` + reason.
  The sweeper sends nothing while paused (rows stay QUEUED). All Admins get an
  in-app `Notification`. An Admin resumes it from the Messaging page after fixing the
  token/template. A template-specific problem marks just that template in
  `MessageTemplateStatus` and only skips that template.

---

## 12. Webhook (`/api/webhooks/whatsapp`)

- `GET`: Meta verification (`hub.mode=subscribe`, `hub.verify_token` match → echo
  `hub.challenge`, else 403).
- `POST`: mounted in `app.ts` **before** `express.json()` with
  `express.raw({ type: 'application/json', limit: '1mb' })`. `X-Hub-Signature-256`
  is checked by HMAC-SHA256 with `WHATSAPP_APP_SECRET`, using `crypto.timingSafeEqual`.
  Invalid → 401, nothing processed.
- The payload is validated with **zod**. Invalid shape → log it, return 200 (Meta
  would otherwise retry garbage forever).
- **Dedupe + update are one DB transaction per status entry:** insert into
  `MessageStatusEvent` with `ON CONFLICT DO NOTHING` (unique `providerMessageId`,
  `status`). A duplicate is a no-op. Otherwise the conditional status UPDATE runs in
  the same transaction, so a crash mid-way leaves nothing half-applied and Meta's
  retry re-processes cleanly.
- **Monotonic status:** rank SENT 1 < DELIVERED 2 < READ 3. Apply only if the new
  rank is higher (READ before DELIVERED → READ, and DELIVERED still sets
  `deliveredAt` if empty; a late SENT never downgrades). A `failed` webhook is
  applied only if the current status is below DELIVERED.
- Unknown `wamid` → try reconciliation via `biz_opaque_callback_data` (§9.5);
  otherwise store with `messageId = null`, log, return 200.
- Inbound `messages` (customer replies): only the STOP keywords are acted on. They
  set consent to NO (§6, *Q8*). Everything else is ignored this phase.
- DB error while processing → **500**, so Meta retries (it does for non-2xx).
- Public route: its own limiter, **not** the app's general one. It's generous
  (e.g. 2,000/min) because Meta sends bursts, and the signature check runs before any
  DB work, so the limiter only guards against floods.
- **The same monotonic rule applies to API-response writes** (§19.5): one shared
  `applyStatus()` helper is used by the webhook, the send result and reconciliation.
  `SENT` can never overwrite DELIVERED/READ.

---

## 13. Manual resend

- Permission **`message:resend`** (new key) + the usual order data-scope check.
- **Destination = the customer's current WhatsApp number only** (consistent with
  Q1). There's no number picker. To send elsewhere, staff first change the WhatsApp
  number in Customer Details, then Resend.
- **Dialog before sending** shows the message type, the destination (current
  WhatsApp number), the previous message's status and time,
  a **required reason** (Customer didn't receive / Number changed / Customer asked
  again / Other + text), a **preview of the exact text**, and a Confirm button.
- **Content:** a resend **rebuilds the params from the order's current data** (for
  example, the dispatch message shows the current payment status), and the preview
  shows exactly that.
- **Preview = what is sent (§19.7):** the preview API returns a `previewHash` =
  sha256(toPhone + template + language + params). Confirm sends it back. The server
  rebuilds and compares. If anything changed (payment, items, number, language) →
  **409 "Message changed since preview"** with the new preview, the dialog shows it,
  and staff confirm again. Nothing is sent from a stale preview.
- **Blocked when:**
  - a message of the same type for this order is QUEUED / PROCESSING / RETRY_WAIT ("already in progress")
  - the last one of that type was created less than **2 min** ago (cooldown)
  - the customer's WhatsApp consent is NO
  - the number is invalid
  - for dispatch: the order isn't dispatched / has been cancelled
  - the order was created before WhatsApp go-live (Q16, §7.1)
  - an UNKNOWN exists that isn't resolved yet ("resolve the unknown message first", Admin only)
- A DELIVERED/READ original **can** be resent, but the dialog warns "Customer already
  received this".
- Every resend is a **new row** (`RESEND:<uuid>`, `resendOfId`, `resendReason`,
  `triggeredById`) + order activity "WhatsApp dispatch notification resent by X:
  <reason>". Idempotency key as in §8, and the per-user limit is 10 resends / 10 min.

---

## 14. API

| Method | Path | Permission | Purpose |
|---|---|---|---|
| (changed) | customer create/update, `POST /orders` inline customer | as today | phones accept `isWhatsapp`; customer accepts `preferredLanguage`, `whatsappConsent` (**required on create**, optional on update) |
| (changed) | `POST /api/orders`, `POST /api/orders/:id/reorder` | `order:create` | accept the `Idempotency-Key` header; same key + different body → **422** (§19.2) |
| GET | `/api/orders/:id/messages` | `order:read` + scope | message history for the order |
| GET | `/api/orders/:id/messages/preview?type=` | `message:resend` + scope | preview text + recipient for the Resend dialog |
| POST | `/api/orders/:id/messages/resend` | `message:resend` + scope | `{ type, reason, previewHash }` + `Idempotency-Key` (no phone choice, §13) |
| GET | `/api/messaging/status` | `message:manage` | enabled, paused/reason, template statuses, counts |
| GET | `/api/messaging/messages?status=` | `message:manage` | list (Needs attention: UNKNOWN / FAILED / CONFIGURATION) |
| POST | `/api/messaging/messages/:id/resolve` | `message:manage` | UNKNOWN → `mark-sent` / `mark-failed-and-resend` |
| POST | `/api/messaging/resume` | `message:manage` | clear the circuit breaker |
| POST | `/api/messaging/templates/refresh` | `message:manage` | re-check template approval with Meta |
| GET/POST | `/api/webhooks/whatsapp` | public + verify token / HMAC | §12 |

---

## 15. Configuration (Render environment, never committed)

```
WHATSAPP_ENABLED=false                  # master switch
WHATSAPP_PROVIDER=meta                  # meta | dryrun
WHATSAPP_API_VERSION=v26.0              # default; v21.0 expires 2027-01-21 (Meta version table, checked 2026-11-24)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=                  # permanent System User token — SECRET
WHATSAPP_APP_SECRET=                    # webhook HMAC — SECRET
WHATSAPP_WEBHOOK_VERIFY_TOKEN=          # random string you choose
WHATSAPP_TEMPLATE_CONFIRMATION=ps_order_confirmation
WHATSAPP_TEMPLATE_DISPATCHED=ps_order_dispatched
WHATSAPP_DELIVERY_ESTIMATE_DAYS=5–7     # shown in the dispatch message
```

In `config.ts`: everything is optional. If `ENABLED=true` and `PROVIDER=meta`, then
the token, phone-number id, app secret and verify token are required, and the app
won't start without them (same approach as `JWT_SECRET`). `dryrun` logs the payload
and returns a fake `wamid.dryrun-…`, and is what local development and tests use.
Only `.env.example` gets placeholders.

---

## 16. Decisions (approved by user, 2026-11-24)

| # | Question | Decision |
|---|---|---|
| — | Consent model | **YES / NO only**, staff-recorded; new customer **defaults to YES (preselected)**, staff can switch to NO; existing customers **YES via the one-time backfill** (Q3); STOP → NO; consent NO = no messages; NO while queued = stopped. **Frozen** |
| Q1 | WhatsApp numbers per customer | **At most one** |
| Q2 | New customer: first/primary phone WhatsApp flag | **ON** by default |
| Q3 | Existing customers | **Updated by the user 2026-11-24:** the one-time backfill (A5) sets **consent YES** (source `BACKFILL`, audited) and **marks the primary phone as WhatsApp only if it's a valid Indian mobile**. All customer records and order history are kept. **No messages are sent** by the migration or the backfill |
| Q4 | Default language | **English** (switch per customer to Hindi via the "WhatsApp Message Language" dropdown) |
| Q13 | Names in Hindi messages | **Customer names and product names are never translated or transliterated**; they stay exactly as stored (English) in both languages. Quantities/units/order numbers/amounts are unchanged too. **Frozen** |
| Q14 | Consent default for new customers | **YES preselected**; staff can switch to NO; existing customers → YES via the backfill (Q3) |
| Q16 | Orders created before go-live | **NO (user, 2026-11-24).** Orders created before go-live never get an automatic WhatsApp message, even if dispatched after go-live. Only orders created **after** go-live are eligible. Existing records never trigger retroactive messages. Existing orders and their dispatch history stay unchanged; this is a **notification rule, not a data rule**. Normal consent, phone and pre-send checks still apply to eligible new orders. Go-live definition and enforcement: §7.1 |
| Q15 | Staff visibility | Post-save toast with order and WhatsApp outcomes shown separately + the WhatsApp messages card on Order Details with status explanations (§0.1) |
| Q5 | Re-dispatch after an Admin/Manager correction | **No automatic second message**; use Resend |
| Q6 | Hindi template not approved | **Fall back to English** |
| Q7 | Article No. in the dispatch message | **Include** ("Will be shared soon" if empty) |
| Q8 | Customer replies STOP | **Consent set to NO automatically** |
| Q9 | Resend permission | `message:resend` for **Admin, Manager and Employee**; `message:manage` **Admin only** |
| Q10 | Provider | **Meta Cloud API directly** (dry-run provider locally) |
| Q11 | WhatsApp business details | Display name **PashuSeva** (proposed, subject to Meta's review). Business number: **to be provided during Meta setup** (§17 steps 2 and 5) |
| Q12 | Payment method wording ({{5}}) | **Decided:** Nothing paid → "Cash on Delivery" / "कैश ऑन डिलीवरी"; part payment → "Part prepaid, balance due on delivery" / "कुछ एडवांस, बाकी डिलीवरी पर।"; fully paid → "Prepaid" / "पूरा भुगतान हो चुका है"; free → "Free order" / "निःशुल्क ऑर्डर" (§4.2) |

---

## 17. Setup guide — Meta WhatsApp Cloud API (one time)

1. **Meta Business account** (business.facebook.com). Start **Business
   Verification**; unverified accounts have a low daily limit of new customers.
2. **Business phone number**: one **not** registered on the WhatsApp / WhatsApp
   Business app (or delete that account first, which loses its chats). It must be able
   to receive the OTP SMS/call.
3. **Meta app**: developers.facebook.com → Create App → type **Business** → link the
   business → add the **WhatsApp** product.
4. **Test first**: WhatsApp → API Setup gives a test number, a 24 h token and up to 5
   verified recipients. Use these in a *local* `.env` for test E2.
5. **Real number**: API Setup → Add phone number → display name **PashuSeva** (Meta
   reviews it) → OTP. Copy the **Phone number ID** and **WhatsApp Business Account ID**.
6. **Permanent token**: Business Settings → Users → **System Users** → add (Admin) →
   assign the app + WhatsApp account (full control) → Generate token with
   `whatsapp_business_messaging` + `whatsapp_business_management`, expiry **Never**.
7. **App secret**: App → Settings → Basic → App Secret.
8. **Templates**: WhatsApp Manager → Message templates → create the **4** templates
   from §4 (category **Utility**, header "PashuSeva", the exact names and languages)
   with sample values → submit. Wait for **Approved**.
9. **Payment method**: WhatsApp Manager → Payment settings → add a card. Meta charges
   per Utility message; check Meta's current India pricing.
10. **Deploy the backend** with `WHATSAPP_ENABLED=false`.
11. **Webhook**: App → WhatsApp → Configuration → Callback URL
    `https://<render-backend-host>/api/webhooks/whatsapp`, verify token = your
    `WHATSAPP_WEBHOOK_VERIFY_TOKEN` → Verify and save → subscribe to **`messages`**.
12. **Render** → Environment → add all `WHATSAPP_*` → set `WHATSAPP_ENABLED=true`
    last → redeploy → Admin → Messaging page shows "Enabled", 4 templates Approved.
13. **Smoke test** (§18 F3).

---

## 18. TODO

### A. Database (preserve everything, additive only)

**Rules for every A step:** no `migrate reset`, no `migrate dev`/seed against
production, no DROP or RENAME of existing tables/columns. Every local command sets
`DATABASE_URL`/`DIRECT_URL` **explicitly to local Docker PG** (`backend/.env` points at
production Neon). Every generated migration SQL file is **reviewed before it's
applied** and must contain no `DROP`, `ALTER … DROP`, `RENAME` or `TRUNCATE`.

- [x] A0. **Inspect the existing database (read-only), DONE 2026-11-24.** Done on a
  local Docker `postgres:18` copy restored from the verified full backup
  `pashuseva-full-2026-11-24_2234.dump`; production was not touched. Findings:

  **Schema and migrations**
  - **No drift.** `prisma migrate diff` (local copy → `schema.prisma`) is empty, and
    `migrate status` reports "29 migrations, up to date". Latest:
    `20261005120000_trash_retention_30_days`.
  - Production and local are both **PostgreSQL 18** (prod 18.7). Prisma CLI/client
    7.9.1. The schema has 24 models and 10 enums.
  - **Partial unique index is supported natively** by Prisma 7.9.1 via
    `previewFeatures = ["partialIndexes"]` +
    `@@unique([customerId], where: { isWhatsapp: true })`, which generates exactly
    `CREATE UNIQUE INDEX … WHERE ("isWhatsapp" = true)`. **No raw SQL is needed** and
    there's no risk of a future migration dropping it. Turning the flag on changes
    nothing in the existing schema (the diff stays empty).
  - FK convention: Customer/Order references are `RESTRICT`; User references
    (`createdById` etc.) are `SET NULL`. Phase 32 follows the same convention (A1).
  - `CustomerActivity` = `activity` text + `metadata` jsonb + nullable
    `createdById`. Consent audit entries fit as-is: metadata
    `{ field, from, to, source }`, `createdById` null for STOP/backfill.

  **Data (468 customers, 515 orders)**
  - Customers: **429 active**, 0 trashed, 39 purged. Every active customer has
    **exactly 1 primary phone** (351 have 1 phone, 78 have 2).
  - **Backfill preview (A5):** **429 → consent YES**. **427 primary phones flagged
    WhatsApp**. **2 not flagged** (only 9 digits, genuinely invalid).
  - **6 phones contain a non-breaking space (U+00A0)**, typical of numbers pasted
    from WhatsApp or the web. `toWhatsappNumber` must strip **all Unicode whitespace
    incl. U+00A0** (then require ASCII `[0-9]`). *(Corrected in B1: **all 4**
    affected primaries are valid, since the 11-digit one starts with the trunk 0.
    The 427 total was already right.)*
  - 1 customer has the same number twice (no impact: only the primary is flagged).
    4 numbers are shared between different customers (allowed; each customer has its
    own phone row).
  - Orders now: 84 NOT_DISPATCHED, 159 DISPATCHED, 162 DELIVERED, 31 RETURNED,
    8 RETURN_PENDING (non-trashed); 76 cancelled. **All existing orders are
    pre-go-live → never messaged (Q16).**
  - Payments: `paymentStatus` matches `SUM(payments)` for **every** order;
    **0 overpaid**; 3 reversals; status PENDING 338 / PAID 176 / PARTIAL 1; REFUNDED
    never used.
  - **Order-item units:** PACKET 229, PIECE 182, BAG 147, null 18, plus **legacy
    free-text units** "10 kg" (9), "Packet" (2), "Bag" (1), found only in
    ORD-2026-000001…000012, before units became an enum. Rendering rule (B4): match
    the enum names case-insensitively → English singular/plural; any other text →
    shown as stored in brackets (`× 2 (10 kg)`); null → `× 2`.
  - Message size: max **5 items per order**, longest item line ~207 chars, well
    inside the limits. One product name contains an en dash (U+2013), which is fine.
  - Users: 1 Admin, 16 Managers, 28 Employees (all statuses), 2 rejected; **no
    `message:*` permissions exist**. Permissions are per-user grants, so Q9's
    defaults need a **grant backfill for existing users**, like the earlier
    `20260910100000_backfill_order_export_permission` (C5).

  **Corrections applied to the plan from A0:**
  - The partial index is in `schema.prisma` (preview feature), not raw SQL.
  - `OutboundMessage.toPhoneId` is a **plain Int with no foreign key**. Phone rows
    are deleted when a number is edited, and a `RESTRICT` FK would block that edit.
    The pre-send recipient check handles a missing row.
  - Phone normalization strips U+00A0.
  - The unit-rendering fallback is defined.
  - `message:resend` gets a grant backfill for existing users.

- [x] A1. **DONE 2026-11-24 (schema edited, not yet committed; it's committed together with its migration in A2 so it can never be deployed without it).**
  - `schema.prisma`: +217 lines, 1 line changed (the generator gains `previewFeatures = ["partialIndexes"]`). Existing lines are untouched; a `prisma format` reflow was deliberately reverted to keep the diff reviewable.
  - `prisma validate` passes; `prisma generate` + backend `tsc --noEmit` pass, so the current code compiles unchanged against the new schema.
  - SQL preview against the local copy of production: 7 enums, new columns on `Customer` (5), `CustomerPhone` (1) and `Order` (2), all nullable or with a constant default (no table rewrite on PG 18), 4 new tables, the partial unique index `CustomerPhone_one_whatsapp_per_customer … WHERE ("isWhatsapp" = true)`, and 7 FKs (User refs SET NULL, Customer RESTRICT, Order/self/event refs SET NULL). **No DROP / RENAME / TRUNCATE / DELETE / type change.**
  - Original A1 scope: everything from §5:
  `CustomerPhone.isWhatsapp` + the partial unique index;
  `Customer.preferredLanguage`, `whatsappConsent` (enum `{ YES NO }`, column default
  NO) + `whatsappConsentAt/ById/Source` (incl. `BACKFILL`), **no opt-out Boolean**;
  `Order.idempotencyKey/idempotencyHash`; `OutboundMessage` (incl. `claimToken`,
  `sendStartedAt`, `lateResponseNote`), `MessageStatusEvent`, `MessagingState`
  (incl. `rateLimitedUntil`), `MessageTemplateStatus`; enums; back-relations. All
  new columns are nullable or defaulted, so existing rows stay valid and the
  current code keeps working.
- [x] A2. **DONE 2026-11-24 (local copy only; production untouched).**
  - Backup: the verified full backup `pashuseva-full-2026-11-24_2234.dump` (SHA256
    `4CE00B40…3094`; a test restore matched all 25 table counts) was restored into
    local Docker `p32-local` (`postgres:18`, port 55432). A4 takes a new same-day
    backup before production.
  - Pre-migration fingerprint of all 25 tables (row count + md5 over every existing
    column) recorded for A3.
  - Migration `20261124180000_phase32_whatsapp_automation/migration.sql` generated
    with `migrate diff` (local copy → schema), with a header comment. Scan: **no
    DROP / RENAME / TRUNCATE / DELETE / UPDATE / ALTER COLUMN / SET NOT NULL** (the
    only hits were the header text and the FK `ON DELETE SET NULL / ON UPDATE
    CASCADE` rules). It contains 7 CREATE TYPE, 3 ALTER TABLE ADD COLUMN (8
    columns), 4 CREATE TABLE, 15 indexes and 7 foreign keys.
  - Applied with `prisma migrate deploy` behind a guard that refuses any URL other
    than `localhost:55432` (Prisma confirmed `at "localhost:55432"`): 30 migrations,
    "up to date", and the schema-vs-DB diff is empty.
  - Sanity check: all 468 customers consent NO / language EN (database defaults;
    YES comes from A5); 507 phones `isWhatsapp = false`; 515 orders with a NULL
    idempotency key; the partial index exists with `WHERE ("isWhatsapp" = true)`;
    the new tables are empty (**0 messages**).
  - Original A2 scope: fresh production backup with the existing
  procedure (`pg_dump` via Docker `postgres:18` → `D:\pashuseva\backups`, verified
  readable with `pg_restore --list`) → restore into local Docker PG → generate
  `<ts>_phase32_whatsapp_automation` and apply it **locally only**.
- [x] A3. **DONE 2026-11-24, all checks passed (local disposable copies only; full report: `D:\pashuseva\backups\phase32-verification\A3-REPORT.md`).**
  - Before/after fingerprints: all 24 business tables have identical row counts and
    checksums over every existing column; `_prisma_migrations` is +1 row with its 29
    existing rows identical; 83 constraints valid, 0 invalid indexes. The fingerprint
    files are preserved in that folder.
  - Existing-code workflows: **17/17 with the old code (`e1e7655`)** and **17/17
    with the new code** on the migrated schema. Covered: create/edit customer,
    create/dispatch order, inline new customer, payment, parcel label (new and
    pre-migration order), lists, dashboard. Old-code rows got the safe defaults
    and 0 message rows, so **rolling back the app after A4 is safe**.
  - Constraints/relationships: 24/24.
  - **Recovery drill finding:** Prisma does **not** wrap a migration in a
    transaction. A failure half-way leaves enums and columns behind, and later
    deploys stop with P3009 (Render keeps the previous deploy). Recovery was proven
    (resolve `--rolled-back` + remove the Phase-32-only objects + redeploy → data
    identical to BEFORE). With the migration wrapped in `BEGIN; … COMMIT;`, the same
    failure leaves **nothing** behind and recovery is just resolve + redeploy (also
    proven, data identical).
    **Wrapping the migration in `BEGIN; … COMMIT;` was approved and done → see A3-R.**
  - **A3-R, revised migration (user-approved 2026-11-24), DONE, all PASS.** The
    migration was wrapped in `BEGIN; … COMMIT;` (+11 lines, no SQL statement changed,
    all statements transaction-safe). The local DB was rebuilt from the original
    backup (fingerprint identical to the original BEFORE), the revised migration was
    applied, and the before/after fingerprints show all 24 business tables
    identical. A deliberate failure placed just before `COMMIT;` left **zero**
    Phase 32 objects (0 enums/tables/columns/indexes/FKs). Recovery was just
    `migrate resolve --rolled-back` + redeploy, and the data was identical to BEFORE.
    The results are appended to `A3-REPORT.md` (the original A3 text is kept), with
    new `a3r-*` fingerprint files.
  - Original A3 scope: before/after the migration,
  compare
  - row counts for every existing table (customers, phones, addresses, products,
    categories, orders, items, order addresses, payments, delivery tracking,
    activities, notes, users, permissions, audit log, notifications, stock history)
  - checksums of key columns (e.g. `md5(string_agg(...))` over customer
    name/phones, order totals, payment amounts)
  - FK/relationship integrity

  Then run the **old commit's code** on the migrated DB (create/edit customer,
  create/dispatch order, add payment, parcel label) and the new code. Also simulate a
  failed migration and recover with `migrate resolve` (§19.1, E38).
- [ ] A4. **Controlled production migration** (only after A0–A3 and the backend tests
  pass): a fresh verified prod backup taken the same day → push → Render runs
  `migrate deploy` with **`WHATSAPP_ENABLED=false`** → read-only production check:
  same row counts as the backup, the app works as before.

  **Rollback:** the migration is additive, so redeploy the previous commit; the old
  code runs on the new schema. Worst case: restore the verified backup using the
  documented procedure (`migrate deploy` + `pg_restore --data-only
  --disable-triggers`).
- [ ] A5. **One-time backfill script** `scripts/phase32Backfill.ts` (Q3), run **after
  A4 with WhatsApp still disabled**:
  1. sets `whatsappConsent = YES` (source `BACKFILL`, timestamp, customer-activity
     entry) for every existing non-trashed, non-purged customer
  2. sets `isWhatsapp = true` on the **primary** phone **only if** it normalizes to
     a valid Indian mobile (`toWhatsappNumber`)

  Modes: `--dry-run` (default; prints counts: customers → YES, phones flagged,
  phones skipped as invalid, with a sample list) → `--apply`. Idempotent: re-running
  changes nothing. It only touches `Customer` / `CustomerPhone` /
  `CustomerActivity`, and **never creates an `OutboundMessage` or triggers a send**.
  Messages only ever come from the two events (order created, dispatch transition)
  after go-live. Run locally on the restored copy first.
- [ ] A6. Customer purge also scrubs `OutboundMessage.toPhone/params/snapshot/lastError`
  and `MessageStatusEvent.raw` for that customer (and any still-pending row → SKIPPED)

### B. Backend — messaging core (`src/services/messaging/`)
- [x] B0. **DONE 2026-11-24.** The one shared payment calculation.
  - `utils/paymentSummary.ts` → `summarizeOrderPayment(total, paid, paymentStatus)`
    (pure) returning `{ total, paid, due, overpaid, kind: FREE|UNPAID|PARTIAL|PAID|REFUNDED }`;
    `due = max(total − paid, 0)`, `overpaid = max(paid − total, 0)`, kind from
    `paymentStatus` exactly as the parcel label already did; no rounding (formatting is
    the caller's).
  - `services/orderPayment.ts` → `getOrderPaymentSummary(order, tx?)` reads
    `SUM(payments)` (reversals are negative rows) and logs a warning if ever overpaid.
    *(Signature takes the already-loaded order `{id,total,paymentStatus}`, not just an
    id, to avoid a second order query.)*
  - `parcelSummary.service.ts` now uses it; **output unchanged**. Normalized PDFs
    (date stamps and the time-based `/ID` removed, streams inflated) for 7 cases (unpaid,
    partial, paid, payment reversed to ₹0, free ₹0, REFUNDED, decimal ₹1234.50) are
    **7/7 identical** to the old code. The method was first proven stable (same code
    twice → identical) and sensitive (different cases → different output). Cases were
    built in a disposable copy `b0_test` (dropped afterwards; two real candidates were
    in Trash).
  - `utils/paymentSummary.verify.ts`: **12/12** (incl. overpaid clamp, negative net
    ledger, REFUNDED, decimals). Run: `npx ts-node src/utils/paymentSummary.verify.ts`.
- [x] B1. **DONE 2026-11-24.** `utils/phone.ts`:
  - `toWhatsappNumber(raw)` → `91XXXXXXXXXX` or null. Strips all Unicode whitespace
    incl. **U+00A0**, zero-width characters (U+200B/C/D, U+2060, U+FEFF) and `- ( ) . +`,
    then requires **ASCII `[0-9]` only**. Accepts 10 digits, `0`+10, `91`+10, `091`+10,
    `0091`+10, with the national part starting 6–9.
  - `isValidWhatsappNumber`, and `maskWhatsappNumber` (`98XXXX3210`, for staff screens
    and logs).
  - `utils/phone.verify.ts`: **45/45** (NBSP shapes, zero-width, +91/0091/091, landline,
    non-mobile, wrong lengths, Devanagari / Arabic-Indic / full-width digits rejected,
    two numbers in one field rejected, masks). Escapes are kept visible (`\u00A0`
    etc.), with no literal invisible characters in the source.
  - **Real-data cross-check** (local copy, read-only): 429 active customers →
    **427 valid primaries** (4 of them contain U+00A0) + **2 invalid** (9 digits),
    exactly matching A0. All phones of active customers: 504 valid, 3 invalid.
- [x] B2. **DONE 2026-11-24.** `services/messaging/providers/`:
  - `types.ts`: `sendTemplate` **never throws**. It returns ACCEPTED (valid wamid),
    REJECTED {TEMPORARY|PERMANENT|CONFIGURATION, code, retryAfter, rateLimited,
    templateScoped} or AMBIGUOUS.
  - `dryRun.ts` (**default**): no network at all; still validates the request; fake
    `wamid.DRYRUN.*` id.
  - `metaCloud.ts`: request shape per Meta's docs. `biz_opaque_callback_data` = eventKey
    (Meta's status-webhook reference confirms it's echoed in
    `statuses[].biz_opaque_callback_data`; the send-side placement is to be confirmed
    end-to-end at E21). 10 s timeout. Errors are classified by `code`
    (`error_subcode` is deprecated per Meta).
  - `index.ts` picks the provider. **Real Meta only when `WHATSAPP_ENABLED=true` +
    `PROVIDER=meta` + credentials, and outside production also
    `WHATSAPP_ALLOW_NON_PRODUCTION_SEND=true`** (E21 only). Otherwise dry-run, with
    the reason logged.
  - Config (part of B11): `services/messaging/whatsappConfig.ts` (pure, verified) is
    wired into `config.ts`. No WhatsApp env → app starts as before (disabled,
    dry-run). Enabled + meta without credentials → refuses to start. API version
    default **v26.0** (v21.0 expires 2027-01-21 per Meta's version table; re-check at
    E21/A4). `.env.example` has placeholders only.
  - `provider.verify.ts`: **50/50**. A fake Meta server on 127.0.0.1 and a global fetch
    guard that aborts on any non-local host; **0 real WhatsApp requests**.
- [x] B3. **DONE 2026-11-24.** `providers/metaErrors.ts`:
  - Codes are taken from Meta's official Cloud API error-code page (read 2026-11-24),
    with Meta's retry guidance quoted.
  - TEMPORARY (1, 2, 4, 80007, 130429, 131000, 131016, 131056, 131057, 133004; the
    rate-limit codes 4/80007/130429 trigger the shared back-off).
  - PERMANENT (invalid parameters, not on WhatsApp 131026, 131049, 131050, 130403…).
  - CONFIGURATION (token/permission/account/payment/registration; template
    132000/132001/132007/132015/132016 template-scoped).
  - Unknown codes: 5xx → TEMPORARY, else PERMANENT (never loops). An error object never
    maps to AMBIGUOUS.
  - Network errors: never connected (refused/DNS/unreachable/connect-timeout) →
    TEMPORARY. Timeout, reset or body cut off after sending, or a malformed/id-less
    200, or a 5xx without a Meta error → **AMBIGUOUS (UNKNOWN, never auto-retried)**.
    All proven in provider.verify.
- [x] B4. **DONE 2026-11-24.** `services/messaging/templates/`:
  - `definitions.ts`: the 4 templates as data (header/body/footer). EN = the approved
    §4.1/§4.2 text. **HI = DRAFT** (B6).
  - `builders.ts`: snapshot → params. Name, products, order number, units, amounts and
    Article No. are inserted exactly as stored, identical in EN and HI.
  - `i18n.ts`: the only translated parameter words. **{{5}} = exact Q12 strings**;
    HI {{6}}/{{7}}/{{8}}/"+N more" = DRAFT.
  - `format.ts`: units (enum case-insensitive; legacy "10 kg" → `2 (10 kg)`) and ₹ with
    en-IN grouping.
  - `sanitize.ts`: NFC; newline/tab/control → space; keeps ZWJ/ZWNJ; grapheme-safe
    truncation; never empty.
  - Item list fits the computed body budget with "+N more items". Bodies are ≤ 1024
    even for 40 long items or a 3000-char name.
  - `templates.verify.ts`: **57/57**, incl. Meta structure rules, Q12 exact (EN+HI),
    E19a (identical non-translated values) and dirty data.
  - Rendered samples for review: **`PHASE32_TEMPLATES_REVIEW.md`** (regenerate with
    `--write-review`).
- [x] B5. **DONE 2026-11-25.** `services/messaging/snapshot.ts`
  `loadOrderMessageSnapshot(tx, orderId)` reads only the saved order through the
  caller's transaction:
  - OrderItem name/qty/unit/line total (never the live catalogue)
  - the customer name and Article No.
  - money only from B0 `getOrderPaymentSummary`
- [x] B6. **Hindi wording APPROVED by the user (2026-11-25), implemented.**
  - Header "पशुसेवा"; footers "ऑर्डर की पुष्टि" / "डिस्पैच सूचना".
  - Confirmation: "पशुसेवा से ऑर्डर करने…", "आपके ऑर्डर में शामिल सामान:", two-sentence
    closing notice.
  - Dispatch: "ऑर्डर का विवरण:", "ऑर्डर का हिसाब:", the new 5–7 day estimate sentence.
  - {{6}}/{{7}}: unpaid "भुगतान बाकी है" / "डिलीवरी पर देय राशि"; part paid unchanged;
    paid "भुगतान हो चुका है" (shorter, so {{5}} isn't repeated) / "जमा की गई राशि";
    free "निःशुल्क ऑर्डर" / "कोई राशि देय नहीं".
  - **English free order: status changed "Paid" → "Free order"** (amount line stays
    "Nothing to pay"). A free order is never called paid in either language.
  - Q12 {{5}} unchanged.
  - `templates.verify.ts` **67/67**; samples regenerated in `PHASE32_TEMPLATES_REVIEW.md`.
  - **Not yet submittable to Meta:** the product-list layout is pending (§20.1).
- [x] B7. **DONE 2026-11-25** (record creation; list/preview/resend/resolve come with
  C6/D4/D5). `services/messaging/message.service.ts`:
  - `enqueueOrderMessage(tx, {type, orderId, actingUserId})` inserts one row per event
    (unique `eventKey`, `INSERT … ON CONFLICT DO NOTHING`) as QUEUED or SKIPPED.
  - Skip reasons, checked in order: "WhatsApp disabled" → "Order created before WhatsApp
    go-live" (no `goLiveAt` or the order is older) → "No WhatsApp consent" → "No valid
    WhatsApp number".
  - QUEUED rows store the sized template name, language, 91-number, the exact params, a
    snapshot, and a 24 h / 72 h expiry.
  - **Runs inside a SAVEPOINT and never throws:** any messaging error rolls back only
    the message part and is logged; the order carries on.
  - Template-approval fallback (Q6) is checked at send time (B8/B9).
- [x] B8. **DONE 2026-11-25.** `services/messaging/dispatcher.ts`:
  - **Claiming:** atomic claim (`UPDATE … FOR UPDATE SKIP LOCKED`); a new `claimToken`
    per claim; every later write is guarded by (id, PROCESSING, claimToken).
  - **Before the Meta call:** the write-ahead `sendStartedAt`, then the lease guard.
  - **Re-checked before every attempt, fresh from the database:**
    - consent
    - the recipient phone (exists, same customer, still the WhatsApp number, same
      normalized number)
    - customer/order not in Trash, order not cancelled, dispatch still valid
    - go-live, expiry
    - template approval, with the Q6 Hindi → English fallback rebuilt from the
      snapshot
  - **Outcomes:** ACCEPTED → SENT; TEMPORARY → backoff 1/5/15/60 min (Retry-After
    respected, max 5); PERMANENT → FAILED; CONFIGURATION → re-queued untouched +
    pause (or only that template); AMBIGUOUS → UNKNOWN, never resent.
  - A late Meta acceptance after the claim was lost never overwrites (§19.3).
  - Immediate send after the order/dispatch commits (`kickOrderMessages`,
    fire-and-forget).
  - New records are stamped due immediately (fix for app-vs-DB clock skew).
- [x] B8a. **DONE 2026-11-25.** `services/messaging/applyStatus.ts`
  `applyProviderStatus()`:
  - monotonic (SENT < DELIVERED < READ; FAILED only below DELIVERED)
  - reconciliation via `biz_opaque_callback_data` clears the worker claim
  - ready for the webhook (C7)
- [x] B9. **DONE 2026-11-25** (in `dispatcher.ts`). The 30 s sweep:
  - expired locks: send started → UNKNOWN; not started → retry (counted)
  - expire stale → FAILED
  - queue-age alert (> 15 min, max hourly)
  - template-status refresh every 6 h (Meta `message_templates`, our 20 names only)
  - claim 10, concurrency 3, per-row isolation
  - runs only when WhatsApp is enabled; graceful stop on SIGTERM/SIGINT (`index.ts`)
- [x] B10. **DONE 2026-11-25.** `services/messaging/messagingState.ts`:
  - atomic `pauseSending` (one pause, one Admin notification batch) / `resumeSending`
  - shared `setRateLimitedFor`
  - `setGoLiveOnce`
  - template status cache
  - `notifyAdmins`, de-duplicated per title
  - **Verification:** `D:\pashuseva\backups\phase32-verification\B8-B10-REPORT.md`:
    - worker tests **51/51** (fake Meta server, 0 real requests)
    - end to end OFF 14/14 + 17/17, ON (dry-run) 22/22 + 17/17
- [x] B11. **DONE.** WhatsApp config (B2) plus go-live, set once at worker start only
  for a provider that really sends (`setGoLiveOnce`).
- [ ] C0. `customer.repository` `syncPhones`: also update a row when **only `isWhatsapp`** changed (today it compares only label/isPrimary); **clear the old WhatsApp flag before setting the new one** in the same transaction (so a swap doesn't trip the partial index); map the unique violation (P2002) → 409 "Customer was changed by someone else, reload" (§19.1)
- [x] C1. **DONE 2026-11-25** (report:
  `D:\pashuseva\backups\phase32-verification\C1-REPORT.md`).
  - **Validation:** `isWhatsapp` per phone (independent of primary and of consent), at
    most one, and a flagged number must be a valid Indian mobile (B1). Unflagged
    numbers aren't checked, as before.
  - `whatsappConsent` YES/NO + `preferredLanguage` EN/HI on create, update and the
    inline new customer of Create Order.
  - Staff consent is stamped who/when/STAFF (`utils/whatsappConsent.ts`). History:
    "WhatsApp consent recorded" / "WhatsApp consent changed" (previous → new, with
    the employee and the time), language changes, and phone changes with a "WhatsApp"
    tag.
  - `syncPhones` updates on a flag-only change and lets the flag move in one save
    (unflag first). A simultaneous conflict hits the DB index → 409.
  - **Consent is OPTIONAL in the API until D1** (today's screens keep working; omitted
    = the safe default NO). **D1 makes it required on create, together with the
    preselected-YES form.**
  - Tests **29/29**. Regressions: workflows 17/17 ON + OFF, integration 14/14 + 22/22,
    worker 51/51.
- [x] C2. **DONE 2026-11-25.**
  - `POST /orders` and `POST /orders/:id/reorder` accept an optional `Idempotency-Key`
    header (8–128 `[A-Za-z0-9_-]`, otherwise 400). The key + `sha256(user + canonical
    body)` are stored on the order.
  - Same key + same body → the existing order (**200**, `idempotentReplay`); different
    details or another user → **422** naming the original order. Concurrent same key →
    the unique violation is caught → the existing order.
  - **No key → exactly as before** (the frontend sends keys in D3). Repeat orders are
    never blocked.
  - The confirmation record is created inside the order transaction; the response
    includes `whatsapp: {status, skipReason}`.
- [x] C3. **DONE 2026-11-25.** In `applyDeliveryStatusChange`, only on the genuine
  NOT_DISPATCHED → DISPATCHED transition (delivery-status PATCH and first-Article-No.
  auto-dispatch), in the same transaction (now 15 s timeout like order creation).
  - A repeat (Admin correction) creates no record and adds the activity note "WhatsApp
    dispatch notification not created again (this order already has one) — use Resend
    if needed".
  - **Verification** (`D:\pashuseva\backups\phase32-verification\B5-B7-C2-C3-REPORT.md`,
    disposable copy):
    - WhatsApp OFF **14/14**, ON (dry-run) **22/22**
    - existing-code workflows **17/17 OFF and ON**
    - 0 send attempts
- [x] C4. **DONE 2026-11-25.** `services/messaging/activity.ts`: order Activity entries
  "WhatsApp order confirmation / dispatch notification queued · sent · delivered · read
  by the customer · failed · not sent · status unknown (an Admin will check)", with the
  masked number and the reason.
  - Written only after a write that only one caller can win: unique-event insert,
    claim-guarded worker writes, sweep `UPDATE … RETURNING`, monotonic
    `applyProviderStatus`. So repeated webhooks, late reports, repeated sweeps and
    retries never duplicate an entry.
  - No entry per retry wait or pause.
  - The entry is written in the order transaction at enqueue (inside the savepoint).
  - Tests **14/14**; regressions: worker 51/51, integration OFF 14/14 + ON 22/22,
    workflows 17/17 + 17/17.
- [x] C5. **DONE 2026-11-25.**
  - `message:resend` and `message:manage` added to `PERMISSIONS`. `message:resend` is
    in the Employee and Manager defaults; **`message:manage` is excluded from the
    Manager defaults** (Admin-only, like `employee:manage-permissions`).
  - One-time grant migration `20261125120000_phase32_message_resend_permission`
    (data-only, BEGIN/COMMIT, `ON CONFLICT DO NOTHING`): `message:resend` to every
    Manager/Employee with `order:update` (**21** on the local copy of production);
    `message:manage` to nobody.
  - Tests **11/11**: exactly the eligible users; nobody else; re-running inserts
    nothing; defaults; Admin bypass. Only `UserPermission` (+21) and
    `_prisma_migrations` (+1) changed, and the 552 existing permission rows are
    byte-identical.
  - The A3-verified local copy `pashuseva` was not modified (test copies apply the
    migration themselves).
- [x] C6. **DONE 2026-11-25.**
  - **Order routes** (all behind `checkOrderAccess`):
    - `GET /orders/:id/messages` (order:view): masked numbers; Admin-only notes
      hidden from others.
    - `GET /orders/:id/messages/preview?type=` (message:resend): the exact current
      text, `previewHash`, `blockedReason`, the previous status, and an "already
      received" warning.
    - `POST /orders/:id/messages/resend` (message:resend): every rule re-checked.
      Always a **new** record (`RESEND:`, `resendOfId`, reason, who); the original is
      untouched. Current WhatsApp number only; `previewHash` must match (otherwise
      409 `PREVIEW_CHANGED` with the new preview). Blocked while in progress, while
      UNKNOWN is unresolved, within the 2-min cooldown, above 10 per user per 10 min,
      with consent NO, no number, before go-live, or not dispatched. Idempotency-Key;
      an advisory lock means two at once → one. Order history + audit log.
  - **Admin `/messaging/*`** (message:manage; every action audited): `status`,
    `messages?needsAttention=`, `messages/:id/resolve` (mark-sent /
    mark-failed-and-resend, only unresolved UNKNOWN), `resume`, `templates/refresh`.
  - `HttpError` gained optional `details` (backward-compatible) for the 409 preview
    payload.
  - Tests **38/38 ON + 3/3 OFF**, 0 non-local requests. Regressions: integration
    14/14 + 22/22, workflows 17/17 + 17/17, worker 51/51, activity 14/14.
- [x] C7. Webhook router (§12): raw body, HMAC, zod, dedupe, monotonic, reconciliation, STOP → consent NO, rate limit; mounted before `express.json()`
  - **Done (2026-11-25, local only):** `routes/webhooks/whatsapp.ts` mounted at
    `/api/webhooks/whatsapp` BEFORE `express.json()`; its own rate limit 2000/min.
    GET echoes `hub.challenge` only for our verify token (otherwise 403). POST: 503
    if no app secret; `X-Hub-Signature-256` HMAC over the RAW body with
    `timingSafeEqual` → 401 and nothing processed; signed but non-JSON or unexpected
    shape → 200 ignored; database error → 500 so Meta retries.
  - `services/messaging/webhook.service.ts`: each status report is stored once
    (unique providerMessageId + status, `skipDuplicates`) **in the same transaction**
    as its update through the monotonic `applyProviderStatus`. A repeated webhook is a
    no-op, and a failure part-way stores nothing. Reports only UPDATE the original
    message, reconciling by `biz_opaque_callback_data` = eventKey (UNKNOWN → SENT).
    They never create outbound messages and never move a status backwards. A report
    for an unknown wamid is stored unlinked.
  - **STOP** ("STOP" in any case, "रोकें", "बंद", with trailing punctuation allowed;
    "please stop" is not a STOP) from a customer's WhatsApp number does all of this
    in one transaction:
    - consent → NO (source CUSTOMER_STOP_REPLY, no staff id);
    - adds a customer history entry;
    - every QUEUED / RETRY_WAIT message of that customer → SKIPPED "Customer replied
      STOP", with order history.
    The worker's write-ahead `sendStartedAt` is now conditional on consent still
    being YES, so a message already PROCESSING is stopped too. A repeat STOP is a
    no-op. Other replies and unknown numbers are ignored.
  - Tests **29/29** (in-process app on 127.0.0.1, disposable `c7_test`, dry-run,
    test-only secret/token, 0 non-local requests). Regressions: worker 51/51,
    activity 14/14, integration 14/14 + 22/22, workflows 17/17 + 17/17, C6 38/38 +
    3/3.

### D. Frontend
- [x] D1. **Also: make `whatsappConsent` REQUIRED on customer create in the API (`createCustomerSchema`/inline new customer), in the same step as the form change (C1 kept it optional so today's screens keep working).** **D1 conditions (user, accepting C1, 2026-11-25):**
  - (a) every customer-create path must send an explicit consent value: Add Customer,
    the inline new customer on Create Order, and **any other or future create path**;
    after D1 no path may silently create a customer without one (the API rejects it);
  - (b) YES is preselected but NO stays available, and the preselected YES must reflect
    the customer's actual agreement, not automatic permission because the form was
    saved;
  - (c) test: an API create without consent → 400 on every create path. Customer form (AddCustomerDialog + CustomerDetail edit): a **WhatsApp** toggle next to **Primary** on each phone row (at most one; the first row is ON by default per Q2); **WhatsApp Message Language** dropdown (`English` default / `Hindi`); **WhatsApp Consent** with two radio options, `YES – Customer agreed` (**preselected on create**) / `NO – Customer declined`; on edit it shows the current value + "last changed by X on date". Both fields also appear in the inline new-customer section of Create Order. The CRM UI stays English
  - **Done (2026-11-25, local only).** Customer-create paths, found by a code search
    for every `customerRepository.create` caller (there are exactly two):
    - **POST /customers**: the Add Customer dialog, opened from the Customers page and
      from Create Order's customer picker (this is Create Order's "inline new
      customer"; no screen calls the API's `newCustomer` today);
    - **POST /orders with `newCustomer`**: API only.
    Both share `createCustomerSchema`, where `whatsappConsent` is now required (YES
    or NO). A missing, null, empty, lower-case or other value returns 400 "WhatsApp
    consent is required: send "YES" (customer agreed) or "NO" (customer declined)",
    and nothing is created: no customer, no phone, no order. The repository's
    `create()` type now requires the consent value, its timestamp and its source, so
    a future create path that leaves them out fails to compile. Every create stamps
    who and when (source STAFF) and writes one "WhatsApp consent recorded" history
    entry. Edit, reorder and orders for existing customers are unchanged.
  - Frontend:
    - `lib/whatsapp.ts` holds the shared rules (a client copy of the backend
      phone-number check).
    - `components/WhatsappCustomerFields.tsx` holds the WhatsApp section and the
      per-phone toggle.
    - Add Customer: YES is preselected and NO is available. Directly under the choice:
      "Select YES only after the customer has agreed to receive WhatsApp order
      updates." The YES/NO selection itself is the consent record.
      **Decision (user, D1 review, 2026-11-26):** the mandatory staff confirmation
      checkbox from the first D1 version was removed (one action for staff serving
      rural customers; no separate staff attestation). The reminder text meets
      condition (b).
    - The first phone is the WhatsApp number by default (Q2). At most one phone can
      be the WhatsApp number, and an invalid number shows an error before sending.
    - Message language: English by default, or Hindi. A note says names and products
      stay in English and the CRM stays English.
    - Edit Customer: shows "Saved: … · Last changed by X on date" (or "Customer
      replied STOP…") and the same reminder. Consent is sent only when it changed,
      so a plain re-save does not re-stamp it.
    - **Fixes a latent bug:** the edit form previously left out `isWhatsapp`, which
      would have cleared the WhatsApp flag on every save. It now always sends it.
  - Tests:
    - API **37/37**: both paths × Admin and Employee × 6 invalid forms → 400 with
      nothing created; YES and NO → 201 with the stamp and history entry. Existing
      customer order, edit and reorder unaffected.
    - Browser (Playwright, local only) **19/19** (after the checkbox removal):
      Customers page, Create Order picker and Edit flows. Checks the reminder, that
      there is no checkbox, that YES saves in one action, the request bodies and the
      database.
    - Regressions: integration 14/14 + 22/22, workflows 17/17 + 17/17 (the workflow
      script now sends consent NO when it creates customers), worker 51/51,
      activity 14/14, C6 38/38 + 3/3, webhook 29/29.
- [x] D2. WhatsApp icon beside flagged numbers in CustomerDetail, CustomerPicker, GlobalSearch and the OrderDetail customer card; a **Consent: YES / NO** badge (NO shown in red)
  - **Done (2026-11-26, local only), display only.** `components/WhatsappBadges.tsx`:
    - `WhatsappIcon`: green icon, labelled "WhatsApp number".
    - `ConsentBadge`: "WhatsApp Consent: YES" in green, or "WhatsApp Consent: NO" in
      red.
    - `CompactWhatsapp`: for rows showing one number. It shows the icon when the
      shown primary is the WhatsApp number, or the icon plus the alternate number
      when WhatsApp is on the alternate.
  - Where they appear:
    - CustomerDetail Contact card: icon on the flagged phone, consent badge, and
      "WhatsApp message language: English/Hindi" (an English CRM label).
    - OrderDetail customer card: icon and badge. The printed invoice is unchanged.
    - Create Order picker: icon in the results; icon and badge on the selected
      customer. Rows now show the primary number (previously the first stored
      phone).
    - Global search: icon on customer results.
  - Backend: the lean `searchForOrder` shape gained only `phones[].isWhatsapp` and
    `whatsappConsent`; still no profile fields. No template, builder, i18n or
    product-line code changed (templates check 123/123; `git diff` of
    `services/messaging` is empty).
  - Tests: browser **19/19**, with fixtures of WhatsApp on the primary, on the
    alternate, and consent NO with no number. Covers all four screens, the exact
    shape of the picker API, no Hindi script anywhere in the CRM, the printed invoice
    untouched, and viewing writes nothing. Regressions: D1 37/37 + 19/19,
    integration 14/14 + 22/22, workflows 17/17 + 17/17.
- [x] D3. Create Order: a hint "Confirmation will be sent on WhatsApp to 98xxxx3210 (Hindi)", or an amber "No WhatsApp number / WhatsApp consent is NO, no message will be sent"; for an existing customer it shows the saved consent and language (no consent field); **post-save toast with two separate lines: "Order saved: ORD-…" and "WhatsApp: Queued for sending / Not sent: <reason>"** (§0.1, from `whatsapp` in the create response); `Idempotency-Key` kept in **sessionStorage** for the Create Order page, cleared only on a successful response, so a page refresh after a lost response reuses it (§19.2); a 422 shows "This order may already exist: ORD-…, open it". The same for the Reorder button
  - **Done (2026-11-26, local only).**
    - **Key lifecycle** (`lib/orderSubmit.ts`):
      - One Idempotency-Key per submission, kept in sessionStorage (per tab) under
        `create-order` or `reorder:<sourceOrderId>`.
      - It is reused by a double-click, by the automatic network retry (React Query,
        network errors only, at most 2 retries), by pressing the button again after
        an error, and after a page refresh.
      - It is cleared after a successful response (201, or a 200 replay), so the next
        order, even an identical one, gets a fresh key.
      - A failed request keeps the key; since the server never stored it, re-sending
        it (even with corrected details) creates the order.
      - On a 422 the key is replaced and the page shows "This order may already
        exist: ORD-…" with an "Open it" action. Pressing the button again then
        deliberately creates a new order.
    - **Double submission:** the Create Order button and both Reorder buttons (Order
      Detail and Customer Detail's order history, sharing `lib/useReorder.ts`) also
      ignore a second click while a submission is in flight.
    - **Backend:** the 422 now also returns `existingOrderNumber`. The lean
      order-time customer search gained `preferredLanguage`, for the hint.
    - **Fixed a latent bug:** `apiFetch` used to drop the JSON Content-Type whenever a
      caller passed its own header.
    - **Hint** (under the selected customer, information only):
      - consent YES with a WhatsApp number: "Confirmation will be sent on WhatsApp
        to 98XXXX3210 (Hindi)";
      - otherwise, in amber: "WhatsApp consent is NO, no message will be sent" or
        "No WhatsApp number, no message will be sent".
      - The hint describes the customer, not the global switch. While WhatsApp is
        disabled, the toast reports "Not sent: WhatsApp disabled".
    - **Toast:** "Order saved: ORD-…" (or "Order already saved: …" for a replay),
      plus a second line "WhatsApp: Queued for sending" or "WhatsApp: Not sent:
      <reason>".
  - Tests:
    - API **8/8**: 8 simultaneous creates with one key give 1 order, stock reduced
      once, 1 message. A changed body gives 422 with the order number. A new key
      makes a legitimate second order. A rejected request leaves its key unused.
      6 simultaneous Reorders give 1 order.
    - Browser **27/27**:
      - the hint in three variants;
      - a triple click on Create Order gives 1 request and 1 order;
      - the key is cleared after success, and a second identical order gets a new
        key;
      - a lost response is retried with the same key, with no duplicate;
      - when every answer is lost, the key is kept, and a refresh plus resubmit
        opens the existing order;
      - changed details give "may already exist", then a deliberate new order;
      - network down gives 3 attempts with 1 key and no order, and the next press
        creates the order;
      - a server rejection keeps the key, and the corrected order is created;
      - the toast lines, including the consent-NO reason;
      - Reorder on Order Detail: triple click, a fresh key for each new action, and
        a lost-response retry; Reorder on Customer Detail: double click.
    - Regressions: D1 37/37 + 19/19, D2 19/19 (its picker-shape check now expects
      the D3 language field), integration 14/14 + 22/22, workflows 17/17 + 17/17,
      C6 38/38 + 3/3; 0 non-local requests.
- [x] D4. OrderDetail **WhatsApp messages** card (§0.1): rows per message (type, masked number, language, status chip with time, reason for FAILED/SKIPPED, next retry time for RETRY_WAIT, "resend of #", by whom); **status help text per §0.1 (SENT explicitly "not yet delivered")**; auto-refresh every 10 s while any row is QUEUED/PROCESSING/RETRY_WAIT/SENT
  - **Done (2026-11-26, local only), read-only.**
    `components/WhatsappMessagesCard.tsx` is placed on Order Detail after
    Delivery/Payment and hidden when printing. It only GETs `/orders/:id/messages`
    (C6, order:view): no create, resend or change, and no backend change.
  - One row per message, oldest first, keyed by message id. Each row shows:
    - "#id · Order confirmation / Dispatch notification", or "Resend: …" plus
      "Resend of #… · Reason: …";
    - "To 98XXXX3210" (masked by the server; the full number is never sent to the
      browser);
    - the language, with "(Hindi template not available)" when it fell back;
    - who is accountable (user decision, D4 review): "Triggered by: <staff>" (the
      staff member who created or dispatched the order), "Requested by: <staff>" for
      a manual resend, or "Automatic" when there is no staff actor. The CRM is the
      sender, never the employee;
    - a status chip with the time of the current status, with the §0.1 help text as
      the tooltip and as a line under the row. SENT reads "Accepted by WhatsApp, not
      yet delivered". FAILED reads "Could not be sent: <reason> (code …)". SKIPPED
      reads "Not sent: <reason>". RETRY_WAIT reads "…will retry automatically at
      <time>".
  - Refreshes every 10 s only while a row is QUEUED/PROCESSING/RETRY_WAIT/SENT.
  - No Resend action yet; D5 adds it behind message:resend. The Admin-only late
    response note is never displayed.
  - Tests: browser **31/31** (after the wording change):
    - every one of the 9 statuses (wording, chip and time);
    - FAILED and SKIPPED reasons, the RETRY_WAIT time, the resend row with reason
      and who, the language fallback;
    - masked number only, in both the card and the API response;
    - English only;
    - auto-refresh: 2 refreshes in 23 s while active, a database change shown
      without a reload, no duplicate rows, and no refresh when nothing is active;
    - read-only: only GET requests, no new messages, rows byte-identical after
      viewing;
    - an Employee with order:view only sees the same rows, no Resend, and no
      Admin-only fields.
    Regressions: D2 19/19, D3 8/8 + 27/27.
- [x] D5. **Resend dialog** (§13): type, **current WhatsApp number (no picker; link to Customer Details to change it)**, previous status, required reason, text preview, delivered warning, confirm with `previewHash`; on 409 show the new preview and ask again; button disabled while pending; idempotency key
  - **Done (2026-11-26, local only), frontend only (C6 endpoints unchanged).**
    `components/ResendMessageDialog.tsx` is opened from a **Resend** button that the
    WhatsApp messages card shows on the newest message of each type, only when the
    user has message:resend. The API also returns 403 without it. The dialog shows:
    - the message type;
    - "To 98XXXX3210 (current WhatsApp number)". There is no picker; the link
      "Change the WhatsApp number in Customer Details" goes to /customers/:id;
    - the language;
    - the previous message as "#id · status · time";
    - an amber "already received" warning when a previous message was
      DELIVERED/READ;
    - the server's exact header/body/footer;
    - a required reason (4 options; "Other" needs at least 3 characters of text);
    - why a resend is blocked, if it is.
  - The preview is reloaded from the server every time the dialog opens. Confirm
    sends its `previewHash`.
  - On 409 PREVIEW_CHANGED the new preview replaces the old one with "The message
    changed… Nothing was sent… press Confirm again". The dialog stays open and the
    reason is kept. On another 409 (blocked meanwhile) the preview is reloaded.
  - Confirm is disabled and reads "Queuing…" while the request is pending, and a
    second click is ignored.
  - Idempotency-Key per resend submission (`resend:<order>:<type>`, the same helper
    as orders): kept across retries and the 409, cleared after success.
  - Tests: browser **30/30**:
    - the permission (no button and a 403 without it; a button with it);
    - all dialog contents, including that the non-WhatsApp phone is never offered;
    - the preview matches the server exactly (Hindi message, stored product names);
    - the reason rules; the pending state with a double click giving 1 request and
      1 record;
    - the previewHash is sent, the new record is a RESEND of the original with its
      reason and requester, and the original is byte-identical;
    - the card row "Requested by: …"; the blocked state right after;
    - the 409 after the number changed (nothing queued, new preview, then 1 resend
      to the new number with the same key);
    - a lost response retried with the same key gives 1 resend; the key is cleared
      after success;
    - the dialog wording stays English.
    Regressions: D4 31/31 (its Admin check now expects one Resend button per type),
    D3 8/8 + 27/27.
  - **D5 follow-up, Step 1 (user-approved 2026-11-26), done locally:**
    - **A.** Per message type, in chronological order: "Order confirmation —
      Original", "— Resend #1", "— Resend #2", and so on, with "(message #id)" and
      "Resend of message #…".
    - **B.** The preview returns `lastReceived`: the most recent earlier
      Read/Delivered message of the type, with readAt or deliveredAt ONLY (never
      sentAt or createdAt). The warning reads "A previous confirmation message was
      read by the customer / delivered on 25 Nov at 4:30 pm. Resending may result in
      a duplicate message." If no time was recorded it says "(time not recorded)",
      and there is no warning when nothing was delivered or read.
    - **Same rule for the "Previous message" line:** it now shows the time of the
      current status (`previous.statusAt`): read, delivered, sent or failed time,
      otherwise "created <time>". Before, it showed the creation time next to
      "Delivered".
    - **C.** The toast after a resend adds "Follow its status in the WhatsApp
      messages card."
    - Resend safeguards unchanged (concurrency check 6/6: 5 tabs → 1 resend, 2
      employees → 1, UNKNOWN blocks, 10/10 min per employee).
    - Tests: D5 browser **35/35** (adds the numbering, the Read and Delivered times,
      Sent never shown as delivered, no warning when nothing was received, a missing
      time not invented, the toast line). D4 31/31; C6 38/38 + 3/3.
- [x] D6. Admin **Messaging** page (Settings area, `message:manage`): enabled/paused state + Resume, rate-limited-until, template approval statuses + Refresh, **queue size + oldest queued age**, a **Needs attention** list (UNKNOWN / FAILED / late-response notes) with Resolve actions
  - **Done (2026-11-26, local only).**
    - **Migration `20261126120000_phase32_message_resolution`** (user-approved,
      additive): exactly two nullable columns on OutboundMessage, `resolvedAt
      TIMESTAMP(3)` and `resolutionNote TEXT`, inside BEGIN/COMMIT. Verified on
      disposable copies: on a copy with 40 existing message rows, every original
      column was byte-identical afterwards; the AuditLog was byte-identical; the only
      other row-count change was +1 in `_prisma_migrations`; the new columns are NULL
      for all existing rows; `prisma migrate diff` finds no drift.
    - **Resolve** (`admin.service.resolveUnknown`):
      - The reason is mandatory: 3–300 characters after trimming (400 otherwise),
        and the decision must be explicit (mark-sent / mark-failed-and-resend).
      - Only the status changes (UNKNOWN → SENT/FAILED, so it leaves Needs
        attention), plus resolvedById, resolvedAt and resolutionNote.
      - lastError, errorCode, sentAt and failedAt are NEVER written (no send or
        failure time is invented).
      - The status change, the order history entry ("WhatsApp … marked as
        sent/failed by an Admin", by the Admin, with the reason) and the audit entry
        (decision, previous status, reason, resolvedAt) are written in ONE
        transaction.
      - Concurrency: a guarded update (still UNKNOWN and unresolved). One of
        several simultaneous Admins wins; the others get 409 "already resolved by
        another Admin — reload".
      - Mark-failed-and-resend creates a SEPARATE resend through the normal checks.
        If those block it (e.g. consent NO), the decision stands and
        `resendBlockedReason` is returned.
      - Also fixed: history entries for resends and resolutions said "by user #id"
        (req.user has no name); they now show the staff name.
    - **Needs attention list** adds sendStartedAt, lastAttemptAt, sentAt,
      acknowledgedByWhatsapp (a WhatsApp message id was returned), statusReports,
      maxAttempts, resolvedAt and resolutionNote. The order's message list adds
      resolvedAt and resolutionNote.
    - **Frontend:**
      - `pages/MessagingSettings.tsx` at /settings/messaging (RequirePermission
        message:manage), with a new **Settings → WhatsApp Messaging** sidebar entry
        shown only with message:manage.
      - The page shows: enabled (dry run / real), paused (since, by, reason) with
        Resume behind a confirmation, the rate-limit expiry, go-live, the queue size
        (queued + retrying + sending), the oldest waiting age, the needs-attention
        count, and the template approval table with "Refresh from WhatsApp".
      - The Needs attention list has a Resolve button on unresolved UNKNOWN rows.
      - The Resolve dialog shows the evidence first: current status, attempts,
        sending started, last attempt, WhatsApp acknowledged yes/no, original error
        and code. Nothing is preselected; a decision and a reason are required.
      - On the order card, an Admin-resolved message reads "Marked as sent by an
        Admin; WhatsApp never confirmed it" or "Marked as failed by an Admin
        (original error: …)", plus "Status was unknown; marked as … by X on <date>.
        Reason: …". It does not auto-refresh.
  - Tests:
    - API **44/44**:
      - Manager without message:manage and Employee with message:resend get 403 on
        all 5 routes; a Manager granted message:manage gets 200.
      - 7 invalid bodies give 400 with nothing changed or audited.
      - Mark-sent: error and code preserved, sentAt null stays null, an existing
        sentAt is kept exactly, every other original column unchanged,
        resolvedAt/note/by correct, one audit entry and one history entry.
      - Mark-failed-and-resend: the same preservation, plus a separate RESEND
        record with its own audit entry; when the resend is blocked by consent NO,
        the decision stands and the reason is returned.
      - Re-resolving gives 409 with nothing added.
      - 4 simultaneous resolutions by 2 Admins: exactly 1 succeeds, the stored
        result is entirely the winner's, one audit entry and one history entry.
      - An unresolved UNKNOWN blocks resend and is never re-sent by the worker; the
        block is lifted after resolution.
      - List and status data; pause/resume and template refresh are audited.
    - Browser **24/24**: menu and page hidden and denied without message:manage;
      every state block, queue figure, the template table and Needs attention; the
      dialog evidence (including acknowledged Yes/No), no preselection, the
      mandatory reason; mark-sent and mark-failed-and-resend from the page; a stale
      dialog after another Admin decided is refused and changes nothing; the honest
      wording on the order card; Resume.
    - Regressions: C6 38/38 + 3/3 (its Resolve calls now send the mandatory reason;
      the history check uses the new wording), C7 29/29, templates 123/123,
      providers 50/50, D1 37/37 + 19/19, D2 19/19, D3 8/8 + 27/27, D4 31/31, D5
      35/35, D5 concurrency 6/6, integration 14/14 + 22/22, workflows 17/17 + 17/17.
    - **B8–B10 and C4, resolved 2026-11-26.**
      - The first reruns failed on timing checks, because the test environment's
        clocks were wrong. Windows was not time-synced ("Local CMOS Clock", 3.1 s
        off NTP). The Docker/WSL VM clock ran about 10% fast and was stepped back
        about 2.6 s every ~17 s, so the database was 0.4–3.0 s behind the computer.
        The pre-D6 code failed the same way.
      - Fix, user-approved, environment only: Windows time sync turned on (now
        within 2 ms of NTP); `docker desktop stop` + `wsl --shutdown` + `docker
        desktop start`. A 30-sample check afterwards: PostgreSQL within ±18 ms of
        Windows, Docker VM within 18–59 ms, no jumps, -15 ms over 30 s.
      - Reruns with the scripts, tests and code unchanged: **B8–B10 51/51, C4
        14/14.** D6 is fully verified.
- [ ] D7. Types + API client + react-query hooks for all of the above
- [ ] D8. **Permission picker (`frontend/src/lib/permissions.ts`): add `message:resend` ("Resend WhatsApp message") and `message:manage` ("Manage WhatsApp messaging").** Required before release: the picker saves a user's FULL permission list, so without these two entries saving anyone's permissions would silently remove `message:resend` (found in C5).

### E. Mandatory tests before production (local Docker PG + dry-run, plus a fake-Meta stub server for error responses)
- [ ] E1. Create an order twice with the same idempotency key → one order, one confirmation
- [ ] E2. Double-click Create Order / slow network → one order
- [ ] E3. Timeout **after** the fake Meta accepted → UNKNOWN, no automatic retry; a later webhook with `biz_opaque_callback_data` → reconciled to SENT/DELIVERED
- [ ] E4. Kill the process between the claim and saving the result → after restart the row becomes UNKNOWN (not resent)
- [ ] E5. Two workers (two processes) on the same queue → each row claimed exactly once
- [ ] E6. Restart with QUEUED/RETRY_WAIT rows → they are sent after restart; past `expiresAt` → FAILED Expired
- [ ] E7. Save/edit an already-dispatched order, re-log DISPATCHED, enter an Article No. on a dispatched order → no new dispatch message
- [ ] E8. Admin moves Dispatched → Not Dispatched → Dispatched → no second automatic message, activity note shown
- [ ] E9. Two concurrent dispatch requests → exactly one dispatch message
- [ ] E10. Auto-dispatch via the first Article No. → dispatch message sent
- [ ] E11. Set consent YES → NO / remove the WhatsApp flag / change the number while a message is queued → SKIPPED with the right reason, nothing sent
- [ ] E11a. Consent set to NO between a TEMPORARY failure and its retry → the retry is SKIPPED with **no Meta call** (the fake Meta server receives nothing); resend with consent NO → refused; proves the check runs immediately before every call
- [ ] E12. Duplicate, out-of-order (READ before DELIVERED, late SENT) and bad-signature webhooks → status correct, fake rejected
- [ ] E13. Fake Meta 429 (with Retry-After), 500, invalid token (→ paused + Admin notified + resume works), template not approved/paused, invalid parameters, not-on-WhatsApp number → each handled per §9.4
- [ ] E14. A permanent failure never retries; temporary failures stop at 5 attempts
- [ ] E15. Resend: repeated clicks, while in progress, within the cooldown, without permission, to a customer with consent NO, of an old dispatch (preview shows current data) → each handled per §13; each resend is a new linked row
- [ ] E16. COD unpaid, fully prepaid, partially paid, payment reversed, ₹0 free order → the dispatch amounts are correct and {{5}} matches the Q12 table exactly, in English and Hindi
- [ ] E17. Product renamed / repriced after the order → messages still show the order's snapshot
- [ ] E18. `WHATSAPP_ENABLED=false` / missing credentials → app starts, rows SKIPPED "WhatsApp disabled", existing queue untouched
- [ ] E19. Hindi customer: Hindi template used; Hindi not approved → English fallback recorded
- [ ] E20. Customer with no WhatsApp number, or with consent NO → order created, SKIPPED with the right reason, Create Order hint shown
- [ ] E20a. Add Customer and inline new customer: consent shows **YES preselected**, saving unchanged stores YES, switching to NO stores NO; an API create without the field → rejected; consent change → audited in activity; STOP reply → consent NO; after the migration + backfill (A5): existing customers are YES with source BACKFILL and an activity entry, primaries flagged only where valid, **zero `OutboundMessage` rows created by the backfill**
- [ ] E24. Two simultaneous customer saves flagging different phones as WhatsApp → exactly one succeeds, the other gets 409; the DB never holds two (partial unique index)
- [ ] E25. A queued message whose `toPhoneId` was deleted, renumbered (new row), or is not owned by `customerId` → SKIPPED, no Meta call; a phone with the same number on another customer is never used
- [ ] E26. Same idempotency key + different order details → 422 (no new order, the original unchanged); same key from a different user → 422; same key concurrently → one order
- [ ] E26b. **Repeat orders allowed:** the same customer + identical items submitted as a new form session (new key) → a second order is created, then a third the next "day"; after a successful save the form gets a fresh key; Reorder of the same source order twice (two separate confirmations) → two orders; a failed submit (e.g. stock) then fixed and resubmitted with the same key → the order is created; only a true double-submit/retry of one attempt is de-duplicated
- [ ] E26a. Order transaction fails after enqueue (e.g. stock check) → no order **and** no `OutboundMessage` row
- [ ] E27. Stale worker: claim → lease expires → recovery → Admin resolves → the late worker's result is not written over the resolved state (only `lateResponseNote` + Admin notification)
- [ ] E27a. Crash **before** `sendStartedAt` → back to QUEUED and sent once; crash **after** → UNKNOWN
- [ ] E28. DELIVERED webhook arrives before the API response → the final status stays DELIVERED (no downgrade to SENT); `providerMessageId` set once
- [ ] E29. Fake Meta 200 with an empty / malformed / id-less body → UNKNOWN, never SENT, never retried
- [ ] E30. Customer moved to Trash (order still active) with a queued message → SKIPPED; also order in Trash, order purged, customer purged
- [ ] E31. Reversals: a payment reversed fully, then partially re-paid → dispatch amounts correct (refunds in this system = reversals; REFUNDED status → defensive wording)
- [ ] E32. Forced overpayment state (written directly in the test DB) → due shows ₹0, never negative; status Paid
- [ ] E32a. Parcel label PDF text is identical before and after the `getOrderPaymentSummary` refactor, for unpaid / partial / paid / free orders
- [ ] E33. Payment added between preview and confirm → 409 with the new preview; confirm again → the sent params equal the second preview
- [ ] E34. WhatsApp number changed between preview and confirm → 409; nothing goes to the old number
- [ ] E35. Several workers get CONFIGURATION errors at once → paused once, exactly one Admin notification; the affected rows go back to QUEUED and aren't lost
- [ ] E36. Template approved → paused/rejected at Meta (cache still says approved) → CONFIGURATION for that template only, the other template keeps sending; re-approved + Refresh → resumes
- [ ] E19a. Hindi customer: the message has the Hindi fixed text, but the customer name, product names, units (`2 Bags`), order number and amounts are **byte-identical to the English message's values** (no translation/transliteration)
- [ ] E37. Long product/customer names (incl. any non-ASCII stored in the CRM), conjuncts, emoji, ZWJ, newline/tab/5+ spaces inside names → valid parameters, truncation on grapheme boundaries, the body under Meta's limit
- [ ] E38. Migration drill A2/A3 passes (all existing row counts and checksums unchanged) (old code on the new schema works; a failed migration recovers; Render keeps the previous deploy when `migrate deploy` fails)
- [ ] E39. One row that keeps throwing (forced) → other rows in the same and later batches still send; the bad row ends FAILED after max attempts
- [ ] E40. Confirmation FAILED / SKIPPED / UNKNOWN, then dispatch → dispatch sent normally; confirmation still QUEUED → dispatch waits (max 10 min)
- [ ] E40a. Messaging endpoints respect the order data-scope: an Employee can't list/preview/resend messages of an order outside their scope
- [ ] E40b. Meta 429 with Retry-After while 3 workers run → all pause until `rateLimitedUntil`, nothing is lost
- [ ] E41. Go-live rule (Q16): an order created before `goLiveAt` and dispatched after it → SKIPPED "Order created before WhatsApp go-live", **zero Meta calls**; Resend blocked for it; an order created after `goLiveAt` → normal flow; restart / disable → re-enable doesn't move `goLiveAt`; an unset `goLiveAt` → nothing eligible; the existing order's delivery status, tracking and history are unchanged
- [ ] E21. Real message via the **Meta test number** to your phone (both types, both languages)
- [ ] E22. Playwright: customer phone toggles, language, consent YES/NO (YES preselected on create), post-save toast lines, status help text, Create Order hint, Messages card, Resend dialog, Admin Messaging page
- [ ] E23. `tsc` backend + frontend, eslint

### F. Release
- [ ] F1. Commit + push. Render runs `migrate deploy` (additive)
- [ ] F2. Production migration per A4 with `WHATSAPP_ENABLED=false` (**stays false until all of §18 E, including E21, has passed**) → confirm the existing flows are unchanged → backfill A5 dry-run, review the counts with the user, then apply
- [ ] F3. Only after E1–E41 pass: setup guide steps 11–12 → enable (this sets `goLiveAt`, §7.1; record its value here) → test order to your own number: confirmation arrives (Sent → Delivered → Read) → dispatch it → dispatch notification arrives with correct amounts → trash the test order (Admin trash, as in earlier phases) → record the results here

---

## 19. Failure-scenario review 2 (2026-11-24): checked against the code and resolved

The YES/NO consent design was deliberately left out of this review and is unchanged.

### 19.1 Database and phone numbers
| Scenario | What the code does today | Resolution |
|---|---|---|
| Two staff flag different WhatsApp numbers at once | No DB rule; `syncPhones` matches rows **by phone number** and only updates label/isPrimary | **Partial unique index** `("customerId") WHERE "isWhatsapp"` (native Prisma `partialIndexes`, A0). `syncPhones` also updates on an `isWhatsapp`-only change, clears the old flag before setting the new one, and maps P2002 → 409 (C0, E24) |
| Phone deleted after queueing | Removing a number deletes its row | The pre-send check finds no row → SKIPPED (E25) |
| **Number changed** after queueing | `syncPhones` treats a changed number as **delete + create** (new row id) | The `toPhoneId` check fails → SKIPPED "Recipient changed", so the old message can never reach the new number (E25) |
| Phone "moved" to another customer | **Not possible in the code**: phone rows are only created under their customer; another customer with the same number has a different row | The pre-send check also verifies `phone.customerId = message.customerId` (defence in depth, E25) |
| Phone formatting | No format check today | `toWhatsappNumber` is strict, ASCII `[0-9]` only, non-ASCII digits rejected, with explicit cases for `+91`, `0091`, `091`, `0…`; 12-digit `91…` accepted only if the remaining 10 start with 6–9 (B1) |
| Migration fails half-way | The Render start command is `migrate deploy` → server; **if the migration fails, the server doesn't start and Render keeps the previous deploy** (seen in Phase 27) | The migration is purely additive, so **old code runs fine on the new schema** (rollback = redeploy the previous commit, no down-migration). Drill on a copy of the prod backup before release (A2/A3, E38) |

### 19.2 Order creation and idempotency
| Scenario | Resolution |
|---|---|
| Double click / retried request | Same key + same body → returns the existing order (200), no second order or message |
| Response lost, then the page is refreshed and resubmitted | The key is in **sessionStorage**, cleared only on success, so the resubmit reuses it → the existing order (D3) |
| **Same key, different order details** | `idempotencyHash` = sha256(acting user id + canonical body). A mismatch → **422** "This idempotency key was already used for a different order (ORD-…)". The original order is unchanged (E26) |
| Same key at the same moment | The unique index makes the second transaction fail (its stock decrements roll back) → re-read → the existing order, or 409 "still being created" |
| Two staff genuinely create the same order (different keys) | Two real orders, by design. That's a business duplicate, not a retry, and out of scope |
| Order transaction fails | The message row is inserted **inside** the order transaction, so it rolls back with it (E26a) |
| Reorder | `POST /orders/:id/reorder` calls `create()` too, so it gets the same key handling (C2) |

### 19.3 Worker and queue (stale workers)
- **Claim token.** Every claim writes a new `claimToken`. Every later write by that
  worker is conditioned on `id + status='PROCESSING' + claimToken`.
- **Write-ahead in two steps.** `sendStartedAt` is committed right before the Meta
  call. Expired lease + `sendStartedAt` null → QUEUED (safe). Set → UNKNOWN.
- **Late worker.** If the guarded write matches 0 rows, the worker lost the claim
  (recovered, reconciled, or resolved). It **never overwrites**. If it holds a
  **success with a valid wamid**:
  - and the row is UNKNOWN (unresolved) and has no `providerMessageId` → attach the
    wamid and mark SENT (a safe reconciliation, same as the webhook path)
  - in any other state (e.g. an Admin already chose "mark failed and resend") →
    write only `lateResponseNote` ("Meta accepted this message at …; a resend may
    have duplicated it") + an Admin notification

  A failure response from a late worker is only logged.
- **Lease.** 2 min lease vs a 10 s hard timeout; no Meta call if < 60 s of lease is
  left. No renewal needed.
- **Poison rows.** Per-row try/catch, `Promise.allSettled`, backoff ordering. An
  unexpected exception before `sendStartedAt` → RETRY_WAIT (counts as an attempt) →
  FAILED at the max. After `sendStartedAt` → UNKNOWN (E39).
- **DB offline.** The tick fails and is logged; the next tick retries. If the DB is
  lost right after Meta accepted, the row stays PROCESSING → lease expiry → UNKNOWN →
  webhook reconciliation.

### 19.4 Meta API
| Scenario | Resolution |
|---|---|
| 200 without a valid `messages[0].id` | AMBIGUOUS → UNKNOWN, never SENT (E29) |
| Timeout after Meta accepted / 500 with an unreadable body | AMBIGUOUS → UNKNOWN; never auto-resent |
| Token expires mid-batch | The first CONFIGURATION error pauses (atomic). The other in-flight rows that also get CONFIGURATION errors were **rejected** by Meta (not sent), so they go back to QUEUED with no attempt counted. Nothing is lost (E35) |
| Template paused/rejected after approval | Meta's error at send time beats the cache. That template is marked unavailable and the other keeps going. An Admin refreshes after re-approval (E36) |
| Rate limit with several workers | `MessagingState.rateLimitedUntil` = the shared back-off from `Retry-After`. No worker claims until then (E40b) |
| API version unsupported | `WHATSAPP_API_VERSION` is **verified against Meta's docs at implementation time** (not assumed v21.0). A version-deprecation error → CONFIGURATION → pause + Admin notification |
| Webhook delayed/never arrives | SENT stays SENT (accepted is enough). UNKNOWN rows go to Needs attention after 30 min |

### 19.5 Webhook and API-response races
- **DELIVERED before the API response is saved:** the webhook carries an unknown
  wamid → reconciled via `biz_opaque_callback_data` → the row gets the wamid +
  DELIVERED, and **`claimToken` is cleared**. The API response handler's guarded
  write then matches 0 rows, so there's no downgrade. Final state DELIVERED (E28).
- **One `applyStatus(messageId, newStatus, providerMessageId?)` helper** for
  webhooks, send results and reconciliation. It's a single conditional `UPDATE` with
  a rank in SQL (QUEUED / PROCESSING / RETRY_WAIT / UNKNOWN 0 < SENT 1 < DELIVERED 2 <
  READ 3; FAILED only applied below DELIVERED), so it never moves backwards.
- **Dedupe and update atomic** in one transaction per status entry; a crash mid-way
  → Meta retries → idempotent.
- **Rate limit:** a dedicated, generous webhook limiter, signature check first.

### 19.6 Payment calculation (one function)
Checked in the code:
- Payments are `Payment` rows; **reversals are negative rows** (`reversesPaymentId`)
- `paymentStatus` is derived by `paidStatusFor`
- **there is no refund flow**: `REFUNDED` is never produced, and a "refund" in this
  CRM is a reversal
- **Overpayment is already blocked** in three places: create (`amountPaid > total`),
  `addPayment` (`amount > remaining`, re-summed inside the transaction), and the
  Phase 31 edit (new total below paid is blocked)
- `parcelSummary.service.ts` already computes `due = max(total − paid, 0)` itself

Resolution: **`getOrderPaymentSummary(orderId, tx?)`** is the only place amounts are
computed. It returns total, net paid (incl. reversals), `due = max(total − paid, 0)`,
`overpaid = max(paid − total, 0)` (logged as a warning if > 0; the message then shows
Paid), and a kind (UNPAID / PARTIAL / PAID / FREE / REFUNDED-defensive). The parcel
label, dispatch builder and resend preview all use it. Dispatch params are frozen at
dispatch time; a resend uses current data (§13). Tests: E16, E31, E32, E32a.

### 19.7 Resend consistency
- **Contradiction fixed:** no number picker; resend uses the current WhatsApp number
  only (Q1). To change it, edit Customer Details first.
- **Preview = what is sent:** `previewHash` round-trip; any change (payment, items,
  number, language) → 409 + the new preview → confirm again (E33, E34).

### 19.8 Other scenarios
| Area | Resolution |
|---|---|
| Customer in Trash, order not | The pre-send check covers the customer `deletedAt`/`purgedAt` too (orders of a trashed customer stay active by design) (E30) |
| Order in Trash / purged | Order purge here sets `purgedAt` (soft); both are checked → SKIPPED |
| Cancelled while the dispatch message waits | Order status is re-read before the send → SKIPPED |
| Ordering when the confirmation failed/UNKNOWN | The dispatch is sent normally (§7, E40) |
| Stale messages after downtime | `expiresAt` (§10) |
| Simultaneous configuration errors | Atomic pause, a single Admin notification (E35) |
| Hindi / Unicode | NFC, keep ZWJ/ZWNJ, grapheme-safe truncation (E37) |
| Security | Every `/orders/:id/messages*` route uses the order data-scope check; `/messaging/*` is `message:manage` only (E40a) |
| Privacy on purge | Scrub phone, params, snapshot, lastError and webhook raw data; pending rows → SKIPPED (A6) |
| Shutdown | Stop claiming; in-flight calls finish or time out (10 s); anything interrupted after `sendStartedAt` → UNKNOWN on recovery |
| Queue overload | No bulk trigger exists (orders are created and dispatched one at a time); concurrency 3, batch 10, shared rate-limit back-off; queue size + oldest age on the Admin page + an alert after 15 min |

---

## 20. New architecture requirements (user, 2026-11-25), Q17 + Q18 IMPLEMENTED (local, 2026-11-25)

The user's words: *"This is an architecture requirement, not permission to start
coding."* Nothing in this section has been implemented.

### 20.1 Every product on its own line (WhatsApp confirmation + dispatch, EN + HI)

**Requirement.** Every product is on a separate line, never joined with `|`, in both
message types, both languages and long orders. Product names, quantities, units and
prices stay exactly as stored; only the layout changes. Example:
```
Satvik Shahi Mixer Feed × 2 Bags – ₹500
Milk Booster Powder × 1 Packet – ₹450
Liquid Calcium × 2 Bottles – ₹300
```

**Constraint.** A WhatsApp template parameter can't contain line breaks. Meta's
official pages don't state this (checked 2026-11-25: error-codes, components,
overview, template-review), but the API is widely reported to reject it with *"Param
text cannot have new-line/tab characters or more than 4 consecutive spaces"*. So the
line breaks must be in the **fixed template text**, which means each product needs its
**own parameter on its own line**.

**Options**

| | Design | Pros | Cons |
|---|---|---|---|
| **A (recommended)** | **Template variants by number of product lines, 1–5.** Each variant has one parameter per product line, each on its own line. Orders with more than 5 products: lines 1–4 are products and line 5 is "… +N more items" / "… +N और उत्पाद". A0: real orders have at most 5 items. | Compliant with Meta; exact layout; no blank lines; every product readable | **20 Meta templates** (2 types × 2 languages × 5 variants) instead of 4. Any wording change needs re-approval of the affected variants. Variant chosen per message by item count. |
| B | Put line breaks inside the single `{{3}}` and test it with the Meta test number (E21) | Only 4 templates | Undocumented and widely reported as rejected (every message would FAIL). Meta could start rejecting it at any time. **Not recommended** for production. |
| C | One template with 5 fixed product lines, unused lines filled with a placeholder such as "—" | 4 templates | Visible "—" lines on short orders; looks broken. Not recommended. |

**With A:**
- Names are `ps_order_confirmation_1` … `_5` and `ps_order_dispatched_1` … `_5`, each in `en` and `hi`.
- Confirmation n has `2 + n` parameters; dispatch n has `7 + n`.
- The builders choose variant `min(itemCount, 5)`.
- Meta's "too many variables for the message length" check (error 2388293) is verified per variant before submission.
- `OutboundMessage.templateName` stores the exact variant.
- §17 step 8 becomes 20 templates.
- Tests (E42) are added for every variant and language.

**Q17 DECISION (user, 2026-11-25): 5 template sizes. IMPLEMENTED 2026-11-25 after
the user's GO.** This replaces options A/B/C above.

**Implementation (local, dry-run only):**
- `templates/definitions.ts` generates the 20 templates from the approved base texts.
  `{{ITEMS}}` expands to one placeholder per line, and values are filled by named
  slot because `{{n}}` numbering shifts with size. Helpers: `getTemplate(key, lang,
  size)`, `allTemplates()`, `metaTemplateName(base, size)`.
- `templates/builders.ts` picks size = min(products, 5) and keeps lines 1–4 whole;
  line 5 holds the rest joined by "; ". Only if the 1024 limit is hit does line 5
  end "… +N more items". The 80-char name cap is removed. A last-resort line
  shortening is flagged (`shortenedLine`).
- `templates.verify.ts` **123/123** (E42):
  - all 20 templates pass the structure rules, each product placeholder alone on its
    own line
  - sizes 1–5 × type × language
  - the user's 7-product example reproduced exactly
  - 6 and 12 products: every product present in full, "; " only on line 5
  - 40 long products: "+N more" with the exact count, shown names complete
  - 3000-char name: last resort
  - no line break or tab in any parameter
  - all earlier B4/B6/Q12 checks kept
- Samples regenerated in `PHASE32_TEMPLATES_REVIEW.md`, incl. the 20-name table.
- Open point for Meta review: product lines are placeholders separated only by line
  breaks (the user's exact layout). If Meta's review rejects adjacent placeholder
  lines, the smallest fix is a "• " before each product line (needs the user's OK).

- **20 Meta templates:** sizes 1, 2, 3, 4, 5 products × {confirmation, dispatch} ×
  {en, hi}. Names `ps_order_confirmation_1`…`_5` and `ps_order_dispatched_1`…`_5`.
- **1–5 products:** template size = number of products; one product per line
  (product line = `name × qty unit` for the confirmation, `name × qty unit – ₹price`
  for dispatch).
- **More than 5 products:** the 5-product template.
  - Lines 1–4 are the first four products, one each.
  - **Line 5 is product 5 + every remaining product, joined by "; "** on one line.
    Product names contain no ";" today.
- **No product is ever omitted and no product name is ever shortened.** The current
  80-character name cap is removed.
- **No line contains a line break or tab.** Enforced by `paramProblem()` before
  sending.
- **1024-character limit:** only if the complete message would exceed it, line 5
  keeps as many whole products as fit, then ends with "… +N more items" / "… +N और
  उत्पाद". Lines 1–4 are always complete.
- **Last-resort edge case** (confirmed with the user): a single product line so long
  that the message can't fit even with it alone (real data: longest name 33 chars,
  line ~60) is shortened with "…". This is the only case where text is cut.
- Example (7 products), line 5:
  `Product E × 1 Bag – ₹350; Product F × 2 Bags – ₹500; Product G × 1 Bag – ₹150`.
- Same logic for English and Hindi, for both message types.
- `OutboundMessage.templateName` stores the exact sized name.
- §17 setup step 8 becomes 20 templates. Each size is checked against Meta's
  "too many variables for the length" rule (2388293) before submission.
- Tests (E42): every size 1–5 × type × language, 6/7/12-product orders (nothing
  omitted, "; " on line 5 only), the 1024 fallback, and no newline/tab in any line.

### 20.2 Total Weight shown only when every product's weight is known (everywhere)

**Q18 IMPLEMENTED (user GO 2026-11-25).**
- `utils/orderWeight.ts` is the one rule: `getOrderTotalWeight(items)` returns grams,
  or null when any item's mass is unknown (no product, value ≤ 0, or a unit other than
  G/KG: ML/L count as unknown). `formatTotalWeight` keeps the old display.
- The parcel label prints TOTAL WEIGHT only when the result isn't null.
- `orderWeight.verify.ts` **19/19** (E43).
- **All 444 active orders' labels** were rendered before/after on a disposable copy
  (stability proven: same code twice = 0 differences):
  - **424 byte-identical**
  - **20 differ ONLY by the removed TOTAL WEIGHT line**
  - 0 other differences
- After the change, 265 labels show a total and 179 don't. (The extractor reported
  263 because 2 labels' streams weren't decoded; the shared function confirms both show
  a total: 8.00 KG and 5.00 KG.)

**Requirement.**
- Show Total Weight only when every product in the order has a known weight.
- If even one product has no weight, hide the entire Total Weight section.
- Never show a partial or estimated total, "0 kg", a blank or "N/A".
- One central calculation and display rule, used everywhere.

**Where weight appears today** (read-only inventory, 2026-11-25):

| Place | Shows a total weight? | Change |
|---|---|---|
| **Print Parcel Summary (PDF)** `parcelSummary.service.ts` | **Yes.** Today it sums the known weights and prints `TOTAL WEIGHT` whenever that sum is > 0, so **it prints a partial total when some items have no weight** | **Use the central rule** |
| Order Details, Orders list, order Excel/PDF export, Create Order, order trash views | No | None now; any future total weight must use the central rule |
| WhatsApp confirmation / dispatch templates | No (the approved templates have no weight line) | None. Adding one later needs template variants (a template can't hide a line) and must use the central rule |
| Product pages / product trash | Per-product weight only (not a total) | Not affected |
| Invoices / other prints | No separate invoice print exists; the parcel summary is the only order print | — |

**Impact on real data** (local copy, read-only), 444 active orders:
- **265** have every item weighed, so their label is unchanged.
- **159** have no weights, so the total is already hidden (unchanged).
- **20** print a **partial total today**. Those labels would no longer show Total
  Weight.

**Design:**
- **One central function** `utils/orderWeight.ts`, `getOrderTotalWeight(items)`,
  returns grams, or **null** when any item has no known mass. Unknown means:
  - no linked product
  - `weightValue` missing or ≤ 0
  - unit not G/KG (ML/L are volumes, not weights; none of today's mixed orders
    involve them)
- `formatTotalWeight(grams)` keeps today's display exactly (`≥ 1000 g → "x.xx KG"`,
  otherwise `"N G"`).
- The parcel label prints the section only when the result is non-null.
- Verification uses the same before/after PDF method as B0:
  - all-known orders are byte-identical
  - no-weight orders are identical
  - mixed orders differ only by the removed TOTAL WEIGHT line
  - E43 covers this
- Data note (no change proposed): weight comes from the **current** Product record,
  not a snapshot on the order item, so editing a product's weight changes the weight
  printed on older orders' labels. A deleted product has no weight, so the section
  is hidden. Tell me if you want a weight snapshot on order items; that would be a
  separate, additive change.

### 20.2a Safeguards set by the user on accepting Q17 + Q18 (2026-11-25)

1. **Q17:** keep all 20 approved templates and the exact product-line behaviour.
   **No "• " bullet prefixes** unless Meta actually rejects the templates **and** the
   user approves that change.
2. **Q18:** `utils/orderWeight.ts` stays the **single source of truth** for total
   weight. Any future screen, report, export or message must reuse it and never
   calculate weight on its own.
3. **Production:** no push, deployment, migration or real WhatsApp sending until the
   controlled A4/F steps.

### 20.3 Decisions needed

- **Q17: DECIDED** (5 sizes, line 5 joined by "; ", see above). Waiting for GO.
- **Q18: DECIDED + IMPLEMENTED** (see §20.2). Original question: total-weight rule as designed in §20.2, with ML/L counting as "no known
  weight", applied to the parcel label now (the only total-weight display), and as
  the mandatory rule for any future screen?

---

## 21. Recorded rule: WhatsApp is optional, never a condition for ordering (user, 2026-11-25)

Architecture recommendation, kept as a rule. It doesn't change the approved scope.
Most of it was already decided; this table shows where each part is defined.

**Two independent fields** (§6): **WhatsApp number** (`CustomerPhone.isWhatsapp`: is
this number used on WhatsApp?) and **WhatsApp consent** (`Customer.whatsappConsent`:
has the customer agreed to PashuSeva messages?). A customer can have WhatsApp but
refuse messages, or agree but have no WhatsApp.

| Situation | CRM behaviour | Defined / implemented in |
|---|---|---|
| Valid number + WhatsApp YES + consent YES | **QUEUED** | §6, §18 B7 (done) |
| Valid number + WhatsApp YES + consent NO | **SKIPPED** "No WhatsApp consent" | §6 consent rules, §9.2 check 3, B7 (done) |
| Number not registered on WhatsApp | **FAILED, permanent, never retried**: Meta error **131026** ("not a WhatsApp number…") | §9.4 + B3 `metaErrors.ts` (done). Meta may reject at send time (B8) **or** accept and report `failed` + 131026 later in a status webhook (§12, C7). Both end FAILED with the reason. |
| Number marked WhatsApp = NO (none flagged) | **SKIPPED** "No valid WhatsApp number" | §6 "No WhatsApp number", B7 (done; tested) |
| Customer has no phone at all | **SKIPPED** "No valid WhatsApp number" | B7. The current customer form requires ≥ 1 phone, so this mostly concerns legacy data |
| Invalid mobile number flagged WhatsApp | **SKIPPED** "No valid WhatsApp number"; the WhatsApp flag is also refused when saving the customer | §6 + B1 `toWhatsappNumber` (done), C1 save-time validation (pending) |

**Never blocks the business:**
- Customers can be saved and orders created and dispatched with WhatsApp unavailable,
  consent NO, or WhatsApp switched off (B7 never throws; savepoint; verified
  14/14 + 22/22 + 17/17 workflows, see §18 C3).
- A format-valid number does **not** prove a WhatsApp account. That's only known when
  Meta answers.

The stored skip-reason text is "No valid WhatsApp number" (`SKIP_REASONS.NO_NUMBER`
in `message.service.ts`); "NO_VALID_WHATSAPP_NUMBER" in the recommendation refers to
the same reason.
