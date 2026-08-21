# Core Customer & Order Management Requirements

The application is primarily designed for managing **customers, their purchased products, orders, and delivery status**.

The customer-management system must therefore be designed around the relationship:

```
Customer
   ↓
Orders
   ↓
Products
   ↓
Delivery Tracking
```

A single customer can have multiple orders, and a single order can contain multiple products.

---

## 1. Customer Information

Each customer must have a detailed profile containing:

- Customer ID
- Customer Name
- Multiple Phone Numbers
- Primary Phone Number
- Alternate Phone Numbers
- Full Address
- House/Shop Number
- Street/Area
- Village/Town/City
- District
- State
- Pincode
- Landmark
- Customer Notes
- Created Date
- Updated Date

### Phone Numbers

A customer can have multiple phone numbers.

Example:

```
Primary:
+91 9876543210

Alternate:
+91 9876543211
+91 9876543212
```

The UI should allow the user to:

- Add phone number
- Remove phone number
- Mark one number as primary
- Add a label such as:

- Personal
- Father
- Brother
- Shop
- Alternate
  Do not limit a customer to only one phone number.

---

# 2. Customer Address

Create a proper structured address instead of storing everything as one text field.

Fields:

```
Address Line 1
Address Line 2
Village/Town/City
District
State
Pincode
Landmark
```

Show the complete address clearly on the customer profile.

Provide a **Copy Address** button.

On mobile, make the address easy to read and copy.

---

# 3. Product Management

Create a separate Product module.

Each product should contain:

- Product ID
- Product Name
- Product Description
- Product Category
- SKU
- Price
- Available Stock
- Product Image
- Active/Inactive status
- Created Date
- Updated Date
  Admin should be able to:

- Add product
- Edit product
- Delete/deactivate product
- Search products
- Filter products
- Categorize products
- View product details

---

# 4. Customer Orders

Do NOT store purchased products directly in the Customer table.

Instead use:

```
Customer
   ↓
Order
   ↓
Order Items
   ↓
Product
```

A customer can have many orders.

Example:

```
Customer: Rajesh Kumar

Order #ORD-1001
 ├── Product A × 2
 ├── Product B × 1
 └── Product C × 5

Order #ORD-1052
 ├── Product A × 1
 └── Product D × 2
```

---

# 5. Order Information

Each order should contain:

- Order ID
- Customer ID
- Order Date
- Products
- Quantity
- Product Price
- Total Amount
- Discount
- Final Amount
- Payment Status
- Order Status
- Delivery Status
- Tracking Number
- Courier/Transport Company
- Expected Delivery Date
- Delivered Date
- Order Notes
- Created By
- Created Date
- Updated Date

---

# 6. Order Items

An order can contain multiple products.

Each order item should contain:

- Product
- Product Name snapshot
- Product SKU
- Quantity
- Unit Price
- Discount
- Total Price
  Store the product price at the time of purchase so that historical orders do not change when the product's current price changes.

For example:

```
Product current price: ₹1,500

Customer purchased it:
₹1,200

Later product price changes:
₹1,700

Old order must still show:
₹1,200
```

---

# 7. Order Status

Create a clear order lifecycle.

Use:

```
Order Received
      ↓
Dispatched
      ↓
In Transit
      ↓
Delivered
```

The UI should visually display this as a **horizontal progress tracker** on desktop and a vertical timeline on mobile.

Example:

```
✓ Order Received
       ↓
✓ Dispatched
       ↓
● In Transit
       ↓
○ Delivered
```

---

# 8. Delivery Status

The delivery status should have these states:

### 1. Arrived / Order Received

The order has been received by your business.

### 2. Dispatched

The product has been sent from your location.

### 3. In Transit

The product is currently travelling to the customer.

### 4. Delivered

The customer has received the product.

Optional additional statuses:

```
Cancelled
Delivery Failed
Returned
```

---

# 9. Delivery Timeline

Every order should have a delivery timeline.

Example:

```
17 Aug
Order Received
Customer placed order

18 Aug
Dispatched
Package dispatched from warehouse

19 Aug
In Transit
Package is travelling to destination

21 Aug
Delivered
Package delivered to customer
```

Every status change should store:

- Status
- Date
- Time
- User who changed it
- Optional note

---

# 10. Order Details Page

Create a dedicated Order Details page.

Layout:

### Order Header

Display:

```
Order #ORD-1001

Customer:
Rajesh Kumar

Order Date:
17 August 2026

Total:
₹4,500
```

Buttons:

```
Edit Order
Update Status
Print Order
Download Invoice
```

---

## Customer Information

Show:

```
Rajesh Kumar

📞 +91 9876543210
📞 +91 9876543211

Address:
Village XYZ
District ABC
Haryana
123456
```

Provide:

```
Call
Copy Phone
Copy Address
```

buttons where appropriate.

---

## Products

Display an order-items table:

ProductQuantityPriceTotalProduct A2₹1,000₹2,000Product B1₹1,500₹1,500Product C1₹1,000₹1,000Then:

```
Subtotal
Discount
Shipping
Grand Total
```

---

# 11. Delivery Tracker

The Order Details page must prominently display:

```
ORDER RECEIVED
      ✓
      │
DISPATCHED
      ✓
      │
IN TRANSIT
      ●
      │
DELIVERED
      ○
```

Use Motion animations when the status changes.

Do not use excessive animation.

---

# 12. Orders Dashboard

Add a dedicated Orders section.

Show summary cards:

```
Total Orders
Orders Received
Dispatched
In Transit
Delivered
Cancelled
```

Example:

```
┌──────────────┐
│ Total Orders │
│     1,248    │
└──────────────┘

┌──────────────┐
│ Dispatched   │
│      84      │
└──────────────┘

┌──────────────┐
│ In Transit   │
│      32      │
└──────────────┘

┌──────────────┐
│ Delivered    │
│    1,105     │
└──────────────┘
```

---

# 13. Order List

Create an Orders table with:

- Order ID
- Customer
- Phone
- Products
- Total Amount
- Order Date
- Order Status
- Delivery Status
- Expected Delivery
- Actions
  Actions:

```
View
Edit
Update Status
Print
Download Invoice
```

Add:

- Search
- Pagination
- Sorting
- Filtering
- Date range filter
- Delivery status filter
- Customer filter
- Product filter

---

# 14. Customer Profile — Order History

The customer profile should show all previous purchases.

Example:

```
Rajesh Kumar

Total Orders: 8
Total Purchases: ₹42,500

Order History

ORD-1001
Product A × 2
₹4,500
Delivered
21 Aug 2026

ORD-1025
Product B × 1
₹2,000
Delivered
10 Aug 2026

ORD-1050
Product C × 3
₹8,500
In Transit
```

This makes it easy to understand what a customer has purchased in the past.

---

# 15. Customer Summary

At the top of the customer profile show:

```
Customer Name
Phone Numbers
Address

Total Orders
Total Purchase Amount
Last Order
Current Active Orders
Pending Deliveries
```

Example:

```
Total Orders       8
Total Spent        ₹42,500
Last Order         15 Aug 2026
In Transit         1
Pending            1
```

---

# 16. Important Database Relationship

Use this relationship:

```
User
 │
 ├───────────────┐
 │               │
Customer       Order
 │               │
 │               ├── OrderItem ── Product
 │               │
 │               └── DeliveryTracking
 │
 ├── CustomerPhone
 │
 └── CustomerAddress
```

Recommended core Prisma models:

```
User
Customer
CustomerPhone
CustomerAddress
Product
ProductCategory
Order
OrderItem
DeliveryTracking
CustomerNote
CustomerActivity
Notification
AuditLog
```

---

# 17. Delivery Tracking Database Model

Do not only store the current delivery status.

Keep the complete history.

For example:

```
DeliveryTracking

id
orderId
status
note
location
updatedBy
createdAt
```

Then one order can have:

```
Order #1001

Order Received
17 Aug

Dispatched
18 Aug

In Transit
19 Aug

Delivered
21 Aug
```

This allows the system to maintain a complete delivery history.

---

# 18. Status Update UI

When the user clicks:

```
Update Status
```

open a shadcn Dialog.

Show:

```
Current Status:
Dispatched

Change To:

○ Order Received
○ Dispatched
● In Transit
○ Delivered

Note:
[____________________________]

[Cancel] [Update Status]
```

After updating:

1. Update current order status.
2. Create a DeliveryTracking record.
3. Create a CustomerActivity record.
4. Create an AuditLog record.
5. Show a success toast.
6. Update the UI immediately.

---

# 19. Customer Search

Global search should be able to find customers using:

- Customer name
- Any phone number
- Order ID
- Product name
- Address
- City
- Pincode
  Example:

```
Search: 9876543210
```

should find the customer even if that number is stored as an alternate phone number.
Searching:

```
ORD-1001
```

should directly find the order.
Searching:

```
Product A
```

should show customers/orders associated with that product.

---

# 20. Mobile Experience

The mobile version is extremely important.

A salesperson/employee should be able to use the application from their phone while visiting customers.

On mobile:

### Customer Card

```
Rajesh Kumar

📞 9876543210
📍 Narnaul, Haryana

Orders: 8
Pending: 1

[Call] [View]
```

### Order Card

```
ORD-1001

Rajesh Kumar

2 × Product A
1 × Product B

₹4,500

🚚 In Transit

[View Order]
```

### Delivery Status

Use a vertical timeline on mobile.

---

# 21. Quick Actions

Make common actions extremely fast.

Dashboard should have:

```
+ Add Customer
+ Create Order
+ Add Product
+ Update Delivery
```

From the customer page:

```
+ New Order
+ Add Phone
+ Add Note
```

From the order page:

```
Update Delivery
Add Note
Print Invoice
```

---

# 22. Main Navigation

Use:

```
Dashboard

Customers

Orders

Products

Delivery Tracking

Tasks / Follow-ups

Analytics

Employees

Notifications

Audit Logs

Settings
```

The primary focus should remain:

**Customers → Orders → Products → Delivery**

---

# 23. Most Important UX Principle

The application should allow an employee to answer these questions within a few seconds:

### Customer

**Who is the customer?**

### Contact

**How can I contact them?**

### Address

**Where does the customer live?**

### Purchase

**What did they buy?**

### Order

**When did they order it?**

### Delivery

**Where is their product right now?**

### History

**What have they purchased before?**

The UI should make these six pieces of information immediately visible.

---

# 24. Final Core Workflow

The primary business workflow should be:

```
Add Customer
      ↓
Add Phone Numbers
      ↓
Add Customer Address
      ↓
Create Order
      ↓
Select Products
      ↓
Set Quantities
      ↓
Calculate Total
      ↓
Order Received
      ↓
Dispatch Product
      ↓
In Transit
      ↓
Delivered
      ↓
Store Complete Order History
```

The system should preserve the complete history of the customer and every order.

Do not overwrite historical information unnecessarily.

The final application should feel like a **Customer + Order + Product + Delivery Management System**, rather than a generic CRM.

Do not build the full project at once — build phases with usable increments.

See `phases.md` for the full phased implementation roadmap (Phase 1 through Phase 14).
