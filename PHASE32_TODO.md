# Phase 32 — WhatsApp Automation (order confirmation + dispatch notification)

**Status: FINAL — ARCHITECTURE APPROVED (2026-11-24), corrections applied. No code written yet.**

**Development rules (user, 2026-11-24):**
- Implement in the order of the §18 checklist: **database and backend tests before
  frontend integration**.
- **WhatsApp stays disabled in production** (`WHATSAPP_ENABLED=false`) until the full
  §18 E test suite passes **and** the Meta test-number check (E21) passes.

**Consent decision is frozen:** WhatsApp consent is a single **YES / NO** field on the
customer, recorded by staff. No OTP, SMS, IVR, customer verification screen or any
extra consent step (§6). **Don't expand it** unless a real technical or regulatory
requirement makes it necessary.

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
| {{3}} | items: `name × qty`, joined with `  \|  ` | Cattle Feed Supplement × 2  \|  Herbal Mineral Mix × 1  \|  Calcium Powder × 1 |

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
| {{3}} | items: `name × qty – ₹lineTotal`, joined with `  \|  ` (from `OrderItem` snapshot) |
| {{4}} | `order.total` formatted `1,250` |
| {{5}} | see payment table below |
| {{6}} | see payment table below |
| {{7}} | see payment table below (a whole line, so the label can change) |
| {{8}} | Article No. if set, else `Will be shared soon` *(decided, Q7)* |

Payment wording (computed from `paid = SUM(payments incl. reversals)`, `due = total − paid`):

| Situation | {{5}} Payment method | {{6}} Payment status | {{7}} |
|---|---|---|---|
| due = total (nothing paid) | Cash on Delivery | Unpaid | Amount to pay: ₹1,250 |
| 0 < due < total | Partly prepaid, balance on delivery | Partially paid | Paid ₹500, amount to pay: ₹750 |
| due = 0, total > 0 | Prepaid | Paid | Amount paid: ₹1,250 |
| total = 0 (Phase 31 free) | Free order | Paid | Amount to pay: ₹0 |

### 4.3 Hindi (`hi`)
Same variables, same order. The Hindi text is drafted during implementation (item B6)
and you approve the wording before it's submitted to Meta. Variables stay
language-neutral (names, numbers); payment wording strings ({{5}}–{{8}}) are
translated by the builder.

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
enum ConsentSource    { STAFF CUSTOMER_STOP_REPLY }

model CustomerPhone {
  // … existing fields
  isWhatsapp Boolean @default(false)          // independent of isPrimary
}

model Customer {
  // … existing fields
  preferredLanguage     MessageLanguage @default(EN)
  whatsappConsent       WhatsappConsent @default(NO)   // existing customers → NO until staff records YES
  whatsappConsentAt     DateTime?                      // when it was last set
  whatsappConsentById   Int?                           // staff who set it (null = customer replied STOP)
  whatsappConsentSource ConsentSource?                 // STAFF / CUSTOMER_STOP_REPLY
}

model Order {
  // … existing fields
  idempotencyKey String? @unique               // §8, set by POST /orders
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
  toPhoneId          Int?                       // CustomerPhone row it came from
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
  lastAttemptAt      DateTime?

  providerMessageId  String?          @unique   // wamid
  sentAt             DateTime?
  deliveredAt        DateTime?
  readAt             DateTime?
  failedAt           DateTime?

  triggeredById      Int?                       // creator / dispatcher / resender
  resolvedById       Int?                       // who resolved an UNKNOWN
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
  staff **must choose YES or NO**. Neither is preselected, and the form won't save
  without a choice. The API requires the field when creating a customer.
- **Existing customers:** the migration sets them to **NO** (consent was never
  recorded) until staff change it *(Q3)*.
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

Order of messages: the worker does not claim an `ORDER_DISPATCHED` row while that
order's `ORDER_CONFIRMATION` is still QUEUED/PROCESSING/RETRY_WAIT (waits up to
10 min, then sends anyway). This stops "dispatched" arriving before "confirmed" when an
order is created and dispatched within seconds.

---

## 8. Idempotency for user actions

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
       attempts=attempts+1, "lastAttemptAt"=now()
WHERE id IN (
  SELECT id FROM "OutboundMessage"
  WHERE status IN ('QUEUED','RETRY_WAIT') AND "nextAttemptAt" <= now()
  ORDER BY id LIMIT $batch
  FOR UPDATE SKIP LOCKED)
RETURNING *;
```
- `dispatch(id)` right after commit uses the same claim, filtered to that id. If the
  sweeper already took it, it gets 0 rows and does nothing.
- **The claim is committed before calling Meta** (write-ahead). The database records
  "we may have sent this" before the external call happens.

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
4. Eligibility: recipient unchanged (§6), order not in Trash.
   Confirmation: the order isn't cancelled. Dispatch: the order is still in the
   dispatched/forward path (not cancelled/returned). Failing any of these → SKIPPED
   with the reason.
5. The template for the chosen language is approved (§4.4).

### 9.3 Call Meta
`POST https://graph.facebook.com/{ver}/{phoneNumberId}/messages` (built-in `fetch`,
10 s timeout), with **`biz_opaque_callback_data` = `eventKey`**. Meta echoes this back
in status webhooks, which is what makes reconciliation (§9.5) possible.

### 9.4 Classify the outcome

| Outcome | errorKind | New status |
|---|---|---|
| 200 with `messages[0].id` | — | **SENT**, save `providerMessageId`, `sentAt`, unlock |
| Connection failed **before** the request was sent (DNS, ECONNREFUSED) | TEMPORARY | RETRY_WAIT (backoff) |
| 429 / Meta rate-limit codes | TEMPORARY | RETRY_WAIT after `Retry-After` or backoff |
| 5xx **with** a Meta error body saying "temporarily unavailable" | TEMPORARY | RETRY_WAIT |
| **Timeout / connection reset after sending / 5xx with no body / response unreadable** | AMBIGUOUS | **UNKNOWN**, never auto-retried |
| Invalid/unreachable recipient, not on WhatsApp, bad parameters | PERMANENT | FAILED (no retry) |
| Invalid/expired token, template missing/paused/disabled, account restricted/locked, payment issue | CONFIGURATION | Row goes back to QUEUED (attempt not counted) + **circuit breaker pauses sending** (§11) + Admin notification |

The exact Meta error-code → kind mapping lives in one table in `metaErrors.ts`. It's
built from Meta's current Cloud API error-code docs at implementation time; unknown
codes default to **PERMANENT** (fail safe, never loop).

Backoff for TEMPORARY: 1 min → 5 min → 15 min → 1 h. After `maxAttempts` (5) → FAILED
"Retries exhausted".

### 9.5 UNKNOWN and crash recovery (the "Meta accepted it, CRM crashed" case)
- **Crash after Meta accepted, before saving the id:** the row is PROCESSING with an
  expired `lockedUntil`. The recovery job turns **expired PROCESSING → UNKNOWN**,
  never back to QUEUED. This is the rule that prevents the duplicate.
- **Automatic reconciliation:** when a status webhook arrives for an unknown `wamid`,
  its `biz_opaque_callback_data` (= eventKey) is looked up. If it matches an UNKNOWN
  (or PROCESSING) row, the row gets the `providerMessageId` and moves to
  SENT/DELIVERED/READ. Resolved, no duplicate.
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
- **Dedupe:** insert into `MessageStatusEvent` with unique
  (`providerMessageId`, `status`). A duplicate is a no-op.
- **Monotonic status:** rank SENT 1 < DELIVERED 2 < READ 3. Apply only if the new
  rank is higher (READ before DELIVERED → READ, and DELIVERED still sets
  `deliveredAt` if empty; a late SENT never downgrades). A `failed` webhook is
  applied only if the current status is below DELIVERED.
- Unknown `wamid` → try reconciliation via `biz_opaque_callback_data` (§9.5);
  otherwise store with `messageId = null`, log, return 200.
- Inbound `messages` (customer replies): only the STOP keywords are acted on. They
  set consent to NO (§6, *Q8*). Everything else is ignored this phase.
- DB error while processing → **500**, so Meta retries (it does for non-2xx).
- Public route: rate limited (generous, e.g. 300/min).

---

## 13. Manual resend

- Permission **`message:resend`** (new key) + the usual order data-scope check.
- **Dialog before sending** shows the message type, the destination number (a picker
  if the customer has more than one phone), the previous message's status and time,
  a **required reason** (Customer didn't receive / Number changed / Customer asked
  again / Other + text), a **preview of the exact text**, and a Confirm button.
- **Content:** a resend **rebuilds the params from the order's current data** (for
  example, the dispatch message shows the current payment status), and the preview
  shows exactly that.
- **Blocked when:**
  - a message of the same type for this order is QUEUED / PROCESSING / RETRY_WAIT ("already in progress")
  - the last one of that type was created less than **2 min** ago (cooldown)
  - the customer's WhatsApp consent is NO
  - the number is invalid
  - for dispatch: the order isn't dispatched / has been cancelled
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
| (changed) | `POST /api/orders` | `order:create` | accepts the `Idempotency-Key` header |
| GET | `/api/orders/:id/messages` | `order:read` + scope | message history for the order |
| GET | `/api/orders/:id/messages/preview?type=` | `message:resend` + scope | preview text + recipient for the Resend dialog |
| POST | `/api/orders/:id/messages/resend` | `message:resend` + scope | `{ type, phoneId?, reason }` + `Idempotency-Key` |
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
WHATSAPP_API_VERSION=v21.0              # current Graph API version at build time
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
| — | Consent model | **YES / NO only**, staff-recorded; new customer must choose; existing customers NO; STOP → NO; consent NO = no messages; NO while queued = stopped. **Frozen** |
| Q1 | WhatsApp numbers per customer | **At most one** |
| Q2 | New customer: first/primary phone WhatsApp flag | **ON** by default |
| Q3 | Existing customers | **Consent NO** + a **one-time backfill of the WhatsApp phone flag** (primary → WhatsApp, valid Indian mobiles only; script after the release) |
| Q4 | Default language | **English** (switch per customer to Hindi) |
| Q5 | Re-dispatch after an Admin/Manager correction | **No automatic second message**; use Resend |
| Q6 | Hindi template not approved | **Fall back to English** |
| Q7 | Article No. in the dispatch message | **Include** ("Will be shared soon" if empty) |
| Q8 | Customer replies STOP | **Consent set to NO automatically** |
| Q9 | Resend permission | `message:resend` for **Admin, Manager and Employee**; `message:manage` **Admin only** |
| Q10 | Provider | **Meta Cloud API directly** (dry-run provider locally) |
| Q11 | WhatsApp business details | Display name **PashuSeva** (proposed, subject to Meta's review). Business number: **to be provided during Meta setup** (§17 steps 2 and 5) |

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

### A. Database
- [ ] A1. Schema from §5: `CustomerPhone.isWhatsapp`; `Customer.preferredLanguage`, `Customer.whatsappConsent` (enum `WhatsappConsent { YES NO }`, default NO) + `whatsappConsentAt/ById/Source` (**no opt-out Boolean**); `Order.idempotencyKey`; `OutboundMessage`, `MessageStatusEvent`, `MessagingState`, `MessageTemplateStatus`; enums; back-relations
- [ ] A2. Migration `<ts>_phase32_whatsapp_automation`, generated and applied against **local Docker PG only**
- [ ] A3. Customer purge also scrubs `OutboundMessage.toPhone/params/snapshot` and `MessageStatusEvent.raw` for that customer
- [ ] A4. Backfill script `scripts/backfillWhatsappFlag.ts` (Q3): dry-run mode first, prints a count, then applies

### B. Backend — messaging core (`src/services/messaging/`)
- [ ] B1. `utils/phone.ts` `toWhatsappNumber()` + test cases
- [ ] B2. `providers/types.ts` (`sendTemplate` → `{ ok, providerMessageId } | { errorKind, code, message, retryAfter? }`), `providers/metaCloud.ts` (fetch, 10 s timeout, `biz_opaque_callback_data`), `providers/dryRun.ts`
- [ ] B3. `metaErrors.ts`: code → errorKind table (unknown → PERMANENT); timeout/reset/no-body → AMBIGUOUS
- [ ] B4. `templates/confirmation.ts`, `templates/dispatched.ts`, `templates/sanitize.ts`, `templates/i18n.ts` (EN/HI strings for payment wording), template-availability + English fallback
- [ ] B5. `snapshot.ts`: build the confirmation/dispatch snapshot from `OrderItem` + `SUM(payments)` (§4.2 table)
- [ ] B6. Hindi template text draft → **user approves the wording** before Meta submission
- [ ] B7. `message.service.ts`: `enqueue(tx, {type, orderId, actingUserId})` (ON CONFLICT DO NOTHING; SKIPPED rows for disabled/no number/consent NO/invalid), `listForOrder`, `preview`, `resend` (all §13 rules), `resolveUnknown`
- [ ] B8. `dispatcher.ts`: claim SQL (§9.1), pre-send checks (§9.2), send, classify (§9.4), backoff, expiry, confirmation-before-dispatch ordering (§7), concurrency 3
- [ ] B9. `sweeper.ts`: 30 s tick: lock recovery → UNKNOWN, claim, send, template-status refresh every 6 h, error-safe; start in `index.ts`, graceful stop on SIGTERM
- [ ] B10. `circuitBreaker.ts`: pause/resume `MessagingState`, Admin `Notification`
- [ ] B11. `config.ts` `WHATSAPP_*` with conditional requirement; `.env.example`

### C. Backend — wiring
- [ ] C1. `customer.schema.ts`: `isWhatsapp` (+ valid-number refine, + at-most-one refine), `preferredLanguage`, `whatsappConsent` (enum YES/NO, **required on create**, optional on update; the service stamps `whatsappConsentAt/ById/Source` on every change); customer repository writes them; activity text `9876543210 (primary, WhatsApp)`, consent changes logged with **previous value, new value, employee and timestamp** (STOP logged as "by customer"), language changes logged
- [ ] C2. `orderService.create`: `Idempotency-Key` (unique `Order.idempotencyKey`; duplicate → return the existing order); `enqueue(tx, ORDER_CONFIRMATION)` inside the transaction; after commit `void dispatcher.dispatch(id)`
- [ ] C3. `applyDeliveryStatusChange`: on the NOT_DISPATCHED → DISPATCHED transition only → `enqueue(tx, ORDER_DISPATCHED)`; the caller dispatches after commit (both `updateDeliveryStatus` and `updateArticleNumber` paths); the re-dispatch activity note (Q5)
- [ ] C4. Order activity: "WhatsApp order confirmation sent / delivered / failed: <reason> / skipped: <reason>", the same for dispatch, resend with the user + reason
- [ ] C5. Permissions `message:resend`, `message:manage` in `permission.schema.ts` + defaults (Q9) + permissions UI labels
- [ ] C6. Routes `/orders/:id/messages*`, `/messaging/*` (§14)
- [ ] C7. Webhook router (§12): raw body, HMAC, zod, dedupe, monotonic, reconciliation, STOP → consent NO, rate limit; mounted before `express.json()`

### D. Frontend
- [ ] D1. Customer form (AddCustomerDialog + CustomerDetail edit): a **WhatsApp** toggle next to **Primary** on each phone row (at most one; the first row is ON by default per Q2); **Message language** EN/HI select; **WhatsApp Consent** with two radio options, `YES – Customer agreed` / `NO – Customer declined`. Neither is preselected on create and a choice is required; on edit it shows the current value + "last changed by X on date". The same field appears in the inline new-customer section of Create Order
- [ ] D2. WhatsApp icon beside flagged numbers in CustomerDetail, CustomerPicker, GlobalSearch and the OrderDetail customer card; a **Consent: YES / NO** badge (NO shown in red)
- [ ] D3. Create Order: a hint "Confirmation will be sent on WhatsApp to 98xxxx3210 (Hindi)", or an amber "No WhatsApp number / WhatsApp consent is NO, no message will be sent"; generate an `Idempotency-Key` per form session and send it
- [ ] D4. OrderDetail **WhatsApp messages** card: rows per message (type, to, language, status chip with time, error tooltip, "resend of #", by whom); auto-refresh every 10 s while any row is QUEUED/PROCESSING/RETRY_WAIT/SENT
- [ ] D5. **Resend dialog** (§13): type, number picker, previous status, required reason, text preview, delivered warning, confirm; button disabled while pending; idempotency key
- [ ] D6. Admin **Messaging** page (Settings area, `message:manage`): enabled/paused state + Resume, template approval statuses + Refresh, a **Needs attention** list (UNKNOWN / FAILED) with Resolve actions
- [ ] D7. Types + API client + react-query hooks for all of the above

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
- [ ] E16. COD unpaid, fully prepaid, partially paid, payment reversed, ₹0 free order → the dispatch amounts are correct
- [ ] E17. Product renamed / repriced after the order → messages still show the order's snapshot
- [ ] E18. `WHATSAPP_ENABLED=false` / missing credentials → app starts, rows SKIPPED "WhatsApp disabled", existing queue untouched
- [ ] E19. Hindi customer: Hindi template used; Hindi not approved → English fallback recorded
- [ ] E20. Customer with no WhatsApp number, or with consent NO → order created, SKIPPED with the right reason, Create Order hint shown
- [ ] E20a. Customer create without a consent choice → rejected (UI and API); consent change → audited in activity; STOP reply → consent NO
- [ ] E21. Real message via the **Meta test number** to your phone (both types, both languages)
- [ ] E22. Playwright: customer phone toggles, language, consent YES/NO (required on create, not preselected), Create Order hint, Messages card, Resend dialog, Admin Messaging page
- [ ] E23. `tsc` backend + frontend, eslint

### F. Release
- [ ] F1. Commit + push. Render runs `migrate deploy` (additive)
- [ ] F2. Deploy with `WHATSAPP_ENABLED=false` (**stays false until all of §18 E, including E21, has passed**) → confirm the existing flows are unchanged → run the backfill script (Q3) dry-run, then apply
- [ ] F3. Only after E1–E23 pass: setup guide steps 11–12 → enable → test order to your own number: confirmation arrives (Sent → Delivered → Read) → dispatch it → dispatch notification arrives with correct amounts → trash the test order (Admin trash, as in earlier phases) → record the results here
