# Phase 32 — WhatsApp message samples (B6 wording + Q17 layout)

Generated from `backend/src/services/messaging/templates` by `templates.verify.ts --write-review`.
Names, products, order numbers, units and amounts are inserted exactly as stored, in English, in both languages.
Q17: every product on its own line (templates for 1–5 product lines); orders with more than 5 products use the
5-line template, whose line 5 holds product 5 and every remaining product separated by "; ".

## The 20 Meta templates

| Message | English | Hindi |
|---|---|---|
| Confirmation, 1 product line(s) | `ps_order_confirmation_1` (en) | `ps_order_confirmation_1` (hi) |
| Confirmation, 2 product line(s) | `ps_order_confirmation_2` (en) | `ps_order_confirmation_2` (hi) |
| Confirmation, 3 product line(s) | `ps_order_confirmation_3` (en) | `ps_order_confirmation_3` (hi) |
| Confirmation, 4 product line(s) | `ps_order_confirmation_4` (en) | `ps_order_confirmation_4` (hi) |
| Confirmation, 5 product line(s) | `ps_order_confirmation_5` (en) | `ps_order_confirmation_5` (hi) |
| Dispatch, 1 product line(s) | `ps_order_dispatched_1` (en) | `ps_order_dispatched_1` (hi) |
| Dispatch, 2 product line(s) | `ps_order_dispatched_2` (en) | `ps_order_dispatched_2` (hi) |
| Dispatch, 3 product line(s) | `ps_order_dispatched_3` (en) | `ps_order_dispatched_3` (hi) |
| Dispatch, 4 product line(s) | `ps_order_dispatched_4` (en) | `ps_order_dispatched_4` (hi) |
| Dispatch, 5 product line(s) | `ps_order_dispatched_5` (en) | `ps_order_dispatched_5` (hi) |

## Samples

### Order confirmation — English, 3 products

Template **`ps_order_confirmation_3`** · language `en` · 3 product line(s) · 358/1024 characters

```
[Header] PashuSeva

Namaste Ram Lal ji! 🙏

Thank you for placing your order with PashuSeva.

Your order ORD-2026-001025 has been successfully received.

Your ordered products:
Satvik Shahi Mixer Feed × 2 Bags
Milk Booster Powder × 1 Packet
Liquid Calcium × 2 Bottles

We are processing your order and will notify you once it is dispatched.

Thank you for choosing PashuSeva! ❤️

[Footer] Order confirmation
```

### Order confirmation — Hindi, 3 products

Template **`ps_order_confirmation_3`** · language `hi` · 3 product line(s) · 345/1024 characters

```
[Header] पशुसेवा

नमस्ते Ram Lal जी! 🙏

पशुसेवा से ऑर्डर करने के लिए धन्यवाद।

आपका ऑर्डर ORD-2026-001025 सफलतापूर्वक बुक हो गया है।

आपके ऑर्डर में शामिल सामान:
Satvik Shahi Mixer Feed × 2 Bags
Milk Booster Powder × 1 Packet
Liquid Calcium × 2 Bottles

हम आपका ऑर्डर तैयार कर रहे हैं। ऑर्डर भेजे जाने पर आपको सूचना दे दी जाएगी।

पशुसेवा चुनने के लिए धन्यवाद! ❤️

[Footer] ऑर्डर की पुष्टि
```

### Dispatch — English, Cash on Delivery, 3 products

Template **`ps_order_dispatched_3`** · language `en` · 3 product line(s) · 569/1024 characters

```
[Header] PashuSeva

Namaste Ram Lal ji! 🙏

Good news! Your PashuSeva order ORD-2026-001025 has been dispatched. 🚚

Order details:
Satvik Shahi Mixer Feed × 2 Bags – ₹500
Milk Booster Powder × 1 Packet – ₹450
Liquid Calcium × 2 Bottles – ₹300

Order summary
• Total amount: ₹1,250
• Payment method: Cash on Delivery
• Payment status: Unpaid
• Amount to pay on delivery: ₹1,250
• Tracking number: EK123456789IN

Expected delivery: approximately 5–7 days from dispatch (estimate, not guaranteed).

Please keep your phone available for delivery updates.

Thank you for choosing PashuSeva! ❤️

[Footer] Dispatch notification
```

### Dispatch — Hindi, Cash on Delivery, 3 products

Template **`ps_order_dispatched_3`** · language `hi` · 3 product line(s) · 580/1024 characters

```
[Header] पशुसेवा

नमस्ते Ram Lal जी! 🙏

खुशखबरी! आपका पशुसेवा ऑर्डर ORD-2026-001025 भेज दिया गया है। 🚚

ऑर्डर का विवरण:
Satvik Shahi Mixer Feed × 2 Bags – ₹500
Milk Booster Powder × 1 Packet – ₹450
Liquid Calcium × 2 Bottles – ₹300

ऑर्डर का हिसाब:
• कुल राशि: ₹1,250
• भुगतान का तरीका: कैश ऑन डिलीवरी
• भुगतान की स्थिति: भुगतान बाकी है
• डिलीवरी पर देय राशि: ₹1,250
• ट्रैकिंग नंबर: EK123456789IN

अनुमानित डिलीवरी: ऑर्डर भेजे जाने के लगभग 5–7 दिनों में पहुंचने की उम्मीद है। यह केवल अनुमान है, पक्की तारीख नहीं।

डिलीवरी अपडेट के लिए कृपया अपना फ़ोन चालू रखें।

पशुसेवा चुनने के लिए धन्यवाद! ❤️

[Footer] डिस्पैच सूचना
```

### Dispatch — Hindi, part prepaid, no Article No. yet, 3 products

Template **`ps_order_dispatched_3`** · language `hi` · 3 product line(s) · 606/1024 characters

```
[Header] पशुसेवा

नमस्ते Ram Lal जी! 🙏

खुशखबरी! आपका पशुसेवा ऑर्डर ORD-2026-001025 भेज दिया गया है। 🚚

ऑर्डर का विवरण:
Satvik Shahi Mixer Feed × 2 Bags – ₹500
Milk Booster Powder × 1 Packet – ₹450
Liquid Calcium × 2 Bottles – ₹300

ऑर्डर का हिसाब:
• कुल राशि: ₹1,250
• भुगतान का तरीका: कुछ एडवांस, बाकी डिलीवरी पर।
• भुगतान की स्थिति: आंशिक भुगतान
• ₹500 जमा, डिलीवरी पर बाकी: ₹750
• ट्रैकिंग नंबर: जल्द ही साझा किया जाएगा

अनुमानित डिलीवरी: ऑर्डर भेजे जाने के लगभग 5–7 दिनों में पहुंचने की उम्मीद है। यह केवल अनुमान है, पक्की तारीख नहीं।

डिलीवरी अपडेट के लिए कृपया अपना फ़ोन चालू रखें।

पशुसेवा चुनने के लिए धन्यवाद! ❤️

[Footer] डिस्पैच सूचना
```

### Dispatch — English, 7 products (line 5 holds products 5–7)

Template **`ps_order_dispatched_5`** · language `en` · 5 product line(s) · 641/1024 characters

```
[Header] PashuSeva

Namaste Ram Lal ji! 🙏

Good news! Your PashuSeva order ORD-2026-001025 has been dispatched. 🚚

Order details:
Product A × 1 Bag – ₹200
Product B × 1 Bag – ₹300
Product C × 1 Bag – ₹250
Product D × 1 Bag – ₹400
Product E × 1 Bag – ₹350; Product F × 2 Bags – ₹500; Product G × 1 Bag – ₹150

Order summary
• Total amount: ₹2,150
• Payment method: Cash on Delivery
• Payment status: Unpaid
• Amount to pay on delivery: ₹2,150
• Tracking number: Will be shared soon

Expected delivery: approximately 5–7 days from dispatch (estimate, not guaranteed).

Please keep your phone available for delivery updates.

Thank you for choosing PashuSeva! ❤️

[Footer] Dispatch notification
```

### Order confirmation — Hindi, 1 product

Template **`ps_order_confirmation_1`** · language `hi` · 1 product line(s) · 287/1024 characters

```
[Header] पशुसेवा

नमस्ते Ram Lal जी! 🙏

पशुसेवा से ऑर्डर करने के लिए धन्यवाद।

आपका ऑर्डर ORD-2026-001025 सफलतापूर्वक बुक हो गया है।

आपके ऑर्डर में शामिल सामान:
Satvik Shahi Mixer Feed × 2 Bags

हम आपका ऑर्डर तैयार कर रहे हैं। ऑर्डर भेजे जाने पर आपको सूचना दे दी जाएगी।

पशुसेवा चुनने के लिए धन्यवाद! ❤️

[Footer] ऑर्डर की पुष्टि
```

### Dispatch — English, free order, 1 product

Template **`ps_order_dispatched_1`** · language `en` · 1 product line(s) · 465/1024 characters

```
[Header] PashuSeva

Namaste Ram Lal ji! 🙏

Good news! Your PashuSeva order ORD-2026-001025 has been dispatched. 🚚

Order details:
Free Sample Pack × 1 Packet – ₹0

Order summary
• Total amount: ₹0
• Payment method: Free order
• Payment status: Free order
• Nothing to pay
• Tracking number: EK123456789IN

Expected delivery: approximately 5–7 days from dispatch (estimate, not guaranteed).

Please keep your phone available for delivery updates.

Thank you for choosing PashuSeva! ❤️

[Footer] Dispatch notification
```
