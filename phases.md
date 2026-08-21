# Phased Implementation Roadmap

See `about.md` for current status and file-level detail on what's actually done vs outstanding for each phase below.

## Phase 1 — Project Foundation

### Goal

Set up the entire project structure before writing business logic.

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Motion
- React Router
- TanStack Query
- React Hook Form
- Zod
- Lucide icons

### Backend

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- Zod
- bcrypt/argon2
- JWT

### Setup

```
frontend/
backend/
```

Configure:

- ESLint
- Prettier
- Environment variables
- Git
- `.gitignore`
- `.env.example`
- API base URL
- Database connection

### UI Foundation

Create:

- Sidebar
- Navbar
- Page container
- Breadcrumbs
- Buttons
- Cards
- Dialogs
- Tables
- Forms
- Toasts
- Loading skeletons
- Error states
- Mobile navigation

### Deliverable

You should be able to run:

```
npm run dev
```

and see the basic application shell.

---

## Phase 2 — Database + Backend Architecture

### Goal

Design the database correctly before building customer/order functionality.

Start with the core entities:

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
```

Then later add:

- Note
- Task
- FollowUp
- Communication
- Notification
- AuditLog

### Core relationships

```
Customer
   │
   └── Orders
          │
          └── OrderItems
                  │
                  └── Products

Order
   │
   └── DeliveryTracking
```

Create:

- Prisma schema
- Migrations
- Indexes
- Foreign keys
- Constraints
- Seed data

### Backend structure

```
controllers
services
repositories
routes
middleware
schemas
utils
```

### Deliverable

You should have a working PostgreSQL database and basic API architecture.

---

## Phase 3 — Authentication, Authorization, Roles & Permission Management

### Goal

Build a secure user-management system where Admin manages Managers, Managers manage Employees, Managers assign customers to Employees, and Managers control what each Employee is allowed to do.

The authorization system should follow:

```
Authentication
      ↓
    Role
      ↓
  Permission
      ↓
Data Access / Assignment
      ↓
    ALLOW / DENY
```

### 1. Authentication

Build the complete authentication system.

#### Features

- Login
- Logout
- Current logged-in user
- Secure password hashing
- Secure session/JWT handling
- Protected routes
- Forgot password
- Reset password
- Change password
- Session expiration
- Login rate limiting
- Account status checking

#### Authentication Flow

```
                    ┌──────────────┐
                    │    Login     │
                    └──────┬───────┘
                           ↓
                    Validate with Zod
                           ↓
                    Find User
                           ↓
                    Verify Password
                           ↓
                  Create Secure Session
                           ↓
                    Current User
                           ↓
                 Role + Permissions
                           ↓
                    Application
```

### 2. Login

Create a clean, responsive login page using shadcn/ui + Tailwind + Motion.

```
┌──────────────────────────────────────┐
│                                      │
│               LOGO                   │
│                                      │
│          Welcome Back 👋             │
│       Sign in to your account        │
│                                      │
│  Email                               │
│  [____________________________]      │
│                                      │
│  Password                            │
│  [____________________________] 👁   │
│                                      │
│  Forgot Password?                    │
│                                      │
│  [          Sign In          ]       │
│                                      │
└──────────────────────────────────────┘
```

Include:

- Form validation
- Loading state
- Error state
- Password visibility toggle
- Responsive design
- Smooth Motion animations

### 3. Registration

Do not provide public registration in production. This is an internal business application.

Instead:

```
Admin
  ↓
Create Manager / Employee
  ↓
User Account
  ↓
User Login
```

A registration endpoint can be used for initial development/setup, but public registration should be disabled in production.

### 4. Password Security

Never store plain-text passwords.

Use:

- Argon2, or
- bcrypt

Store only: `passwordHash`

Never return the password hash through an API.

#### Password requirements

At minimum:

- 8+ characters
- At least one letter
- At least one number

### 5. Secure Session / JWT

For the browser application, prefer a secure cookie-based authentication approach.

Use appropriate cookie settings:

- HttpOnly
- Secure
- SameSite

Handle:

- Session expiration
- Session invalidation
- Logout
- Authentication state

Avoid storing sensitive authentication tokens in localStorage.

### 6. Current User

Create:

```
GET /api/auth/me
```

Example response:

```json
{
  "id": "user-id",
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "role": "EMPLOYEE",
  "status": "ACTIVE"
}
```

Never return:

- Password
- Password hash
- Reset token
- Authentication secrets

### 7. Forgot & Reset Password

Flow:

```
Forgot Password
       ↓
Enter Email
       ↓
Generate Reset Token
       ↓
Send Reset Link
       ↓
Reset Password
       ↓
Login
```

Reset tokens should be:

- Random
- Short-lived
- Single-use
- Stored securely/hashed

### 8. Change Password

Authenticated users can change their password from:

```
Settings
   ↓
Security
   ↓
Change Password
```

Fields:

- Current Password
- New Password
- Confirm New Password

### 9. User Roles

Use three roles:

```
ADMIN
MANAGER
EMPLOYEE
```

Role determines the maximum scope of authority, while permissions determine what an Employee can actually do.

### 10. Admin

Admin has complete access.

```
ADMIN
 │
 ├── Dashboard
 ├── Customers
 ├── Products
 ├── Orders
 ├── Delivery
 ├── Employees
 ├── Managers
 ├── Reports
 ├── Audit Logs
 └── Settings
```

Admin can:

- Create Managers
- Create Employees
- Edit users
- Activate/deactivate users
- Change roles
- View all customers
- View all products
- View all orders
- View all delivery information
- Manage system settings
- View audit logs

### 11. Manager

Manager manages their team.

```
MANAGER
 │
 ├── Dashboard
 ├── Customers
 │    ├── View
 │    ├── Create
 │    ├── Edit
 │    └── Assign
 │
 ├── Products
 ├── Orders
 ├── Delivery
 ├── Employees
 │    ├── View Employees
 │    ├── Assign Customers
 │    └── Manage Permissions
 │
 └── Reports
```

Manager can:

- View customers
- Create customers
- Edit customers
- Assign customers to Employees
- Reassign customers
- View Employee activity
- Manage Employee permissions
- View products
- Create/edit products if allowed by business rules
- Create orders
- Edit orders
- Update delivery status
- View team reports

### 12. Employee

Employees work with customers and orders assigned to them.

```
EMPLOYEE
 │
 ├── Dashboard
 ├── My Customers
 ├── Orders
 ├── Products
 ├── Delivery
 ├── Follow-ups
 └── Tasks
```

However, the Employee's access depends on the permissions given by their Manager.

### 13. Employee Permissions

The Manager can individually give or remove permissions.

#### Customers

- `customer:view`
- `customer:create`
- `customer:update`

#### Orders

- `order:view`
- `order:create`
- `order:update`

#### Products

- `product:view`

#### Delivery

- `delivery:view`
- `delivery:update`

You can add more permissions later:

- `customer:delete`
- `order:cancel`
- `product:create`
- `product:update`

### 14. Employee Permission Management

Manager opens:

```
Employees
   ↓
Rahul Sharma
   ↓
Permissions
```

Display:

```
┌──────────────────────────────────────────────┐
│ Employee Permissions                         │
│                                              │
│ Rahul Sharma                                 │
│ Employee                                     │
│                                              │
│ CUSTOMER                                     │
│ ☑ View Customers                             │
│ ☑ Create Customers                           │
│ ☑ Edit Customers                             │
│                                              │
│ ORDERS                                       │
│ ☑ View Orders                                │
│ ☑ Create Orders                              │
│ ☐ Edit Orders                                │
│                                              │
│ PRODUCTS                                     │
│ ☑ View Products                              │
│                                              │
│ DELIVERY                                     │
│ ☑ View Delivery                              │
│ ☑ Update Delivery Status                     │
│                                              │
│              [Save Permissions]              │
└──────────────────────────────────────────────┘
```

### 15. Default Employee Permissions

When a Manager creates an Employee, start with safe defaults:

```
Customers
☑ View
☑ Create
☑ Edit

Orders
☑ View
☑ Create
☐ Edit

Products
☑ View

Delivery
☐ View
☐ Update
```

Manager can customize these permissions.

### 16. Customer Assignment

Managers can assign customers to Employees.

Customer list:

```
┌─────────────────────────────────────────────────────┐
│ Customer       Phone          Assigned To           │
├─────────────────────────────────────────────────────┤
│ Rajesh Kumar   9876543210     Rahul Sharma          │
│ Suresh Kumar   9876543211     Amit Sharma           │
│ Mohan Kumar    9876543212     Unassigned            │
└─────────────────────────────────────────────────────┘
```

Manager can select:

```
Customer:
Rajesh Kumar

Assign To:
[ Rahul Sharma ▼ ]

[ Assign Customer ]
```

### 17. Bulk Customer Assignment

This should be included in Phase 3.

```
☑ Rajesh Kumar
☑ Suresh Kumar
☑ Mohan Kumar
☑ Rakesh Kumar

[Assign Selected]

Assign To:
[ Rahul Sharma ▼ ]

[ Confirm Assignment ]
```

This will be especially useful when you have hundreds or thousands of customers.

### 18. Reassign Customers

Managers can move customers between Employees.

```
Rajesh Kumar
      ↓
Currently: Rahul Sharma
      ↓
Change to: Amit Sharma
      ↓
Reassign
```

Record this action in the activity/audit history.

### 19. Manager → Employee Structure

Use a team hierarchy:

```
                         ADMIN
                           │
             ┌─────────────┴─────────────┐
             │                           │
         MANAGER A                   MANAGER B
             │                           │
       ┌─────┼─────┐               ┌─────┼─────┐
       ↓     ↓     ↓               ↓     ↓     ↓
      E1    E2    E3              E4    E5    E6
```

Manager A can manage: E1, E2, E3, their customers, their orders, their follow-ups, their performance.

Manager B cannot automatically access Manager A's team.

Admin can access everything.

### 20. Employee Data Access

An Employee should not automatically see every customer.

Example:

```
Manager
 │
 ├── Rahul
 │    ├── Rajesh
 │    ├── Mohan
 │    └── Suresh
 │
 └── Amit
      ├── Rakesh
      ├── Vikram
      └── Anil
```

Rahul can access: Rajesh, Mohan, Suresh — but not Rakesh, Vikram, Anil, unless the customer is reassigned.

### 21. Permission + Assignment

Every Employee request should pass two major checks.

Example: Rahul wants to edit Rajesh's customer.

```
Employee requests edit
        ↓
Is authenticated?
        ↓
      YES
        ↓
Has customer:update permission?
        ↓
      YES
        ↓
Is Rajesh assigned to Rahul?
        ↓
      YES
        ↓
     ALLOW
```

If any required check fails: `403 Forbidden`

### 22. Authorization Middleware

Create three important backend middleware layers.

#### `authenticate()`

Checks: is the user logged in?

```
Request
   ↓
authenticate()
   ↓
401 Unauthorized / Continue
```

#### `authorize(permission)`

Checks: does this user have the required permission?

```
authenticate()
      ↓
authorize("order:create")
      ↓
Controller
```

#### `checkAccess()`

Checks: is this specific customer/order within the user's allowed scope?

```
authenticate()
      ↓
authorize()
      ↓
checkAccess()
      ↓
Controller
```

### 23. Example API Authorization

#### Create Customer

```
POST /api/customers
authenticate()
      ↓
authorize("customer:create")
      ↓
createCustomer()
```

#### Edit Customer

```
PATCH /api/customers/:id
authenticate()
      ↓
authorize("customer:update")
      ↓
checkCustomerAccess()
      ↓
updateCustomer()
```

#### Create Order

```
POST /api/orders
authenticate()
      ↓
authorize("order:create")
      ↓
checkCustomerAccess()
      ↓
createOrder()
```

#### Update Delivery

```
PATCH /api/orders/:id/delivery
authenticate()
      ↓
authorize("delivery:update")
      ↓
checkOrderAccess()
      ↓
updateDelivery()
```

### 24. Permission Matrix

| Permission         | Admin | Manager       | Employee                |
| ------------------ | ----- | ------------- | ----------------------- |
| View Customers     | ✅    | ✅            | Permission              |
| Create Customers   | ✅    | ✅            | Permission              |
| Edit Customers     | ✅    | ✅            | Permission + Assignment |
| Delete Customers   | ✅    | ❌            | ❌                      |
| Assign Customers   | ✅    | ✅            | ❌                      |
| View Products      | ✅    | ✅            | Permission              |
| Create Products    | ✅    | ✅            | ❌                      |
| Edit Products      | ✅    | ✅            | ❌                      |
| Delete Products    | ✅    | ❌            | ❌                      |
| View Orders        | ✅    | Team          | Permission + Assignment |
| Create Orders      | ✅    | ✅            | Permission + Assignment |
| Edit Orders        | ✅    | ✅            | Permission + Assignment |
| Cancel Orders      | ✅    | Limited       | ❌                      |
| View Delivery      | ✅    | ✅            | Permission + Assignment |
| Update Delivery    | ✅    | ✅            | Permission + Assignment |
| View Employees     | ✅    | Team          | ❌                      |
| Manage Employees   | ✅    | Team          | Permissions             |
| Manage Permissions | ✅    | Own Employees | —                       |
| View Reports       | ✅    | Team          | ❌                      |
| View Audit Logs    | ✅    | ❌            | ❌                      |
| Settings           | ✅    | ❌            | ❌                      |

### 25. Account Status

Every user should have:

```
ACTIVE
INACTIVE
SUSPENDED
```

- **Active** — can log in.
- **Inactive** — cannot log in.
- **Suspended** — temporarily blocked.

Do not delete employees when they leave. Instead:

```
Rahul Sharma
Role: Employee
Status: INACTIVE
```

Historical orders, notes, assignments and activity should remain intact.

### 26. Employee Management

Manager view:

```
Employees

┌──────────────────────────────────────────────────────┐
│ Employee       Customers    Orders    Status     ⋮ │
├──────────────────────────────────────────────────────┤
│ Rahul Sharma       42        78      Active       ⋮ │
│ Amit Sharma        35        52      Active       ⋮ │
│ Vikram Singh       27        31      Active       ⋮ │
└──────────────────────────────────────────────────────┘
```

Actions:

- View Employee
- Assign Customers
- Manage Permissions
- View Activity
- Deactivate

### 27. Last Login

Track: `lastLoginAt`

Example:

```
Rahul Sharma
Employee
Active

Last Login
18 Aug 2026, 09:42 AM

Assigned Customers
42

Orders
78
```

### 28. Database Models

#### User

```
User
├── id
├── name
├── email
├── passwordHash
├── role
├── status
├── managerId
├── lastLoginAt
├── createdAt
└── updatedAt
```

#### Employee Permissions

```
UserPermission
├── id
├── userId
├── permission
├── grantedBy
├── createdAt
└── updatedAt
```

#### Customer Assignment

```
Customer
├── id
├── name
├── ...
├── assignedEmployeeId
├── assignedManagerId
├── createdAt
└── updatedAt
```

#### Password Reset

```
PasswordResetToken
├── id
├── userId
├── tokenHash
├── expiresAt
├── usedAt
└── createdAt
```

### 29. API Endpoints

#### Authentication

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

POST   /api/auth/forgot-password
POST   /api/auth/reset-password
POST   /api/auth/change-password
```

#### User Management

```
GET    /api/users
GET    /api/users/:id
POST   /api/users
PATCH  /api/users/:id
PATCH  /api/users/:id/status
PATCH  /api/users/:id/role
```

#### Permissions

```
GET    /api/users/:id/permissions
PUT    /api/users/:id/permissions
```

#### Customer Assignment

```
POST   /api/customers/:id/assign
POST   /api/customers/bulk-assign
POST   /api/customers/:id/reassign
```

All protected endpoints should use `authenticate()`, `authorize()`, `checkAccess()` where appropriate.

### 30. Frontend Route Protection

#### Public

```
/login
/forgot-password
/reset-password
```

#### Protected

```
/dashboard
/customers
/products
/orders
/delivery
/tasks
/followups
/analytics
/employees
/settings
/audit-logs
```

The sidebar should dynamically show only the modules the user can access.

### 31. Important Security Rule

Frontend permission checks are only for UI/UX.

For example, if Employee doesn't have `order:update`, don't show the Edit button. But even if the Employee manually calls `PATCH /api/orders/123`, the backend must reject it.

```
Frontend protection
       +
Backend authorization
       +
Data ownership check
```

The backend is the actual security boundary.

### 32. Phase 3 Deliverable

At the end of Phase 3, you should be able to demonstrate this complete workflow:

```
                         ADMIN
                           │
                           ▼
                  Creates Manager
                           │
                           ▼
                    Manager logs in
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      Creates/Manages              Assigns Customers
        Employees                       │
             │                          │
             ▼                          ▼
      Gives Permissions           Rahul → Rajesh
             │                    Amit  → Suresh
             │
             ▼
      Rahul logs in
             │
             ▼
    System checks permissions
             │
       ┌─────┼─────┐
       ▼     ▼     ▼
   Customer Order Product
   Access   Access  View
       │
       ▼
  Assignment Check
       │
       ▼
  Authorized Access
```

### ✅ Final Phase 3 Checklist

Verified against the actual codebase 2026-08-18 (not just assumed) — see `about.md`'s Phase 3 section for file-level detail.

- [x] Login
- [x] Logout
- [x] Current user
- [x] Secure password hashing
- [x] Secure session/JWT handling
- [x] Forgot password
- [x] Reset password
- [x] Change password — backend endpoint existed but had no frontend UI until this audit caught it; added `pages/ChangePassword.tsx`, reachable from the Navbar
- [x] Protected routes
- [x] Session expiration
- [x] Login rate limiting
- [x] Admin role
- [x] Manager role
- [x] Employee role
- [x] Admin employee/manager management
- [x] Manager employee management
- [x] Manager → Employee relationship
- [x] Manager → Customer assignment
- [x] Bulk customer assignment
- [x] Customer reassignment — the `/reassign` endpoint existed but the Employees page always called `/assign` even when a customer already had an owner; fixed so reassignment actually hits `/reassign` (confirmed via the `CustomerActivity` log showing distinct "Assigned to" vs "Reassigned to" entries)
- [x] Employee-specific permissions
- [x] Create Customer permission
- [x] Edit Customer permission
- [x] Create Order permission
- [x] Edit Order permission
- [x] View Product permission
- [x] View Delivery permission
- [x] Update Delivery Status permission
- [x] Account status
- [x] Last login
- [x] `authenticate()` middleware
- [x] `authorize()` middleware
- [x] `checkAccess()` middleware
- [x] Frontend permission-aware UI
- [x] Backend authorization
- [x] Data ownership/assignment checks
- [x] Audit-ready assignment and permission changes

Note on the resource-scoped permissions (`customer:create`/`update`, `order:*`, `product:view`, `delivery:*`): the permission system itself is fully built, grantable, and revocable for all of them. Only `customer:view` is actually gating a live endpoint today, because Products/Orders/Delivery don't have API endpoints yet — those are Phase 5/6/7. `authorize()` already accepts any of these permission strings, so gating each new endpoint as it's built in later phases is a one-line addition, not new plumbing.

### 🏁 Phase 3 is complete when

Admin can create Managers and Employees → Manager can manage Employees → Manager can assign/reassign customers → Manager can give/revoke individual Employee permissions → Employee logs in → Employee sees only permitted modules → Employee can work only with authorized customers/orders → Backend independently enforces every permission and assignment rule.

This gives a strong foundation for Phase 4 — Customer Management, because customer ownership and employee permissions are already established before the customer module is built.

---

## Phase 4 — Customer Management

This should be your first major business module.

### Goal

Build a complete customer management system that supports customer information, multiple phone numbers, assignments, notes, search, filtering, and customer history.

**Core principle: Phase 4 establishes the customer foundation only. Don't mix order logic or inventory logic into this phase — those start in Phase 6.**

### 1. Customer List

Build a responsive customer table/list with:

- Search
- Pagination
- Sorting
- Filtering
  - Status
  - Assigned Employee
  - Assigned Manager
  - City
  - District
  - State
  - Created date
  - Last order date

Example:

```
┌─────────────────────────────────────────────────────────────────┐
│ Customers                                      [+ Add Customer] │
│                                                                 │
│ 🔍 Search customer, phone...    [Filter] [Sort]                │
│                                                                 │
│ Customer       Phone        Assigned To    Orders    Status     │
│ Rajesh Kumar   98765...     Rahul          12        Active     │
│ Suresh Kumar   98761...     Amit            5        Active     │
│ Mohan Kumar    98762...     Rahul            8        Active     │
└─────────────────────────────────────────────────────────────────┘
```

Important: Employee users should only receive customers they are authorized to access, scoped from the backend (per Phase 3's `checkCustomerAccess`) — never filtered client-side only.

**Implemented as:** `GET /api/customers` accepts `search`, `status`, `city`, `district`, `state`, `createdFrom`/`createdTo` (date range), `sortBy` (`name`|`createdAt`), `sortDir` (`asc`|`desc`), `page`, `pageSize`. `assignedEmployeeId`/`assignedManagerId` are also accepted but only take effect for Admin — a Manager/Employee's own role-scope always wins, so they can't widen their view via query params. The frontend exposes all of these except the assigned-employee filter to non-Admins (hidden, since it's a no-op for them).

### 2. Add Customer

**Basic information**

- Name
- Customer Type — only add this if actually needed (e.g. Individual / Business / Dealer / Other). Skip it if all customers are individuals.
- Status

**Contact**

- Phone Numbers (multiple, from day one)
- Email

```
Phone Numbers

+91 9876543210   Primary
+91 9876543211   Alternate
+91 9876543212   Alternate

[+ Add Phone]
```

Store an explicit primary phone number — don't assume the first number in the list is primary.

### 3. Address

Structured fields, not one text blob:

- Address Line
- Landmark
- City
- District
- State
- Pincode
- Country (default to your home country if you only operate in one for now)

Structured fields make filtering and reporting much easier later than a single free-text address string.

### 4. Customer Assignment

Since Phase 3 already added Manager → Employee permissions, customer assignment is part of Phase 4's UI (the backend assignment endpoints already exist from Phase 3 — this is about surfacing them properly in the customer module's own UI, not rebuilding them).

```
Customer:
Rajesh Kumar

Manager:
Suresh Sharma

Employee:
Rahul Sharma
```

Manager should be able to:

- Assign customer
- Reassign customer
- Unassign customer
- Bulk assign customers
- View assignment history

Record assignment history, e.g.:

```
Rajesh Kumar
   ↓
Assigned to Rahul
   ↓
Assigned by Suresh
   ↓
18 Aug 2026
```

This becomes useful later when you need to understand who handled a customer.

**Implemented as:**

- `POST /api/customers/:id/assign`, `POST /api/customers/:id/reassign`, `POST /api/customers/:id/unassign`, `POST /api/customers/bulk-assign` — all Admin/Manager only. A Manager can only assign to Employees on their own team.
- Every `CustomerActivity` entry now includes the acting user (`createdBy`), so the activity feed shows exactly the `"Assigned to Rahul" / by Suresh` shape from the example above — this was missing in the first implementation pass and was added after an audit against this spec.
- **Assignment scoping rule:** a customer's visibility to a Manager is driven by `assignedManagerId`, independently of `assignedEmployeeId`. Two consequences that weren't obvious until tested:
  - A customer **created by a Manager** is auto-scoped to that Manager (`assignedManagerId` set at creation) — otherwise it would be invisible to its own creator until separately assigned to an Employee.
  - **Unassign only clears `assignedEmployeeId`**, not `assignedManagerId`. The customer stays visible in the Manager's team view, shown as "Unassigned" — matching the "Assigned To: Unassigned" row already shown as a normal state in the §1 mockup — rather than dropping into an Admin-only void that even the unassigning Manager can no longer see.

### 5. Customer Details Page

```
Customer
│
├── Overview
├── Contact Information
├── Address
├── Orders
├── Purchases
├── Activity
├── Notes
└── Assignment
```

**Overview** — show:

```
Rajesh Kumar
Active Customer

Total Orders       24
Total Purchases    ₹1,24,500
Pending Orders     3
Delivered Orders   21
```

### 6. Contact Information

```
Phone Numbers

📞 +91 9876543210    Primary
📞 +91 9876543211    Alternate

[Edit]
```

If email is added later:

```
Email
rajesh@example.com
```

### 7. Orders (display only)

Don't implement order creation here — that's Phase 6. For Phase 4, just show the customer's existing orders:

```
Orders

Order #1024
₹4,500
Delivered
18 Aug 2026

Order #1012
₹2,200
In Transit
15 Aug 2026
```

Clicking an order should eventually take the user to the Order Details page (Phase 6).

### 8. Total Purchases

Don't manually store `totalPurchases` as the source of truth — calculate it from completed/delivered orders. Cache it later only if performance requires it. Storing it directly invites drift (e.g. Orders total ₹50,000 but `Customer.totalPurchases` says ₹47,000).

### 9. Customer Activity

Strongly recommended. Example:

```
Activity

Today
• Customer updated
• Phone number changed

Yesterday
• Order #1024 created

15 Aug
• Customer assigned to Rahul

12 Aug
• Customer created
```

This becomes extremely valuable in a CRM. (The `CustomerActivity` model already exists from Phase 2/3 — this phase is about actually populating it from every customer-affecting action, not just assignment.)

### 10. Notes

Let employees/managers add notes — timestamped and attributed to the author, not one giant overwritten notes field:

```
Notes

"Customer prefers delivery in the morning."

Added by Rahul
18 Aug 2026

[+ Add Note]
```

### 11. Customer Status

Start with just:

```
ACTIVE
INACTIVE
```

You could add `LEAD` / `BLOCKED` later, but only if the business actually needs them — don't add them speculatively.

### 12. Customer Deletion

Don't hard-delete customers by default. Use **Deactivate Customer** instead — a customer may have orders, payments, delivery records, notes, and activity tied to them, and those shouldn't disappear because someone clicked Delete.

### 13. Customer Database Structure

```
customers
├── id
├── name
├── email
├── address_line
├── landmark
├── city
├── district
├── state
├── pincode
├── country
├── status
├── assigned_employee_id
├── assigned_manager_id
├── created_by
├── created_at
└── updated_at
```

Separate phone numbers:

```
customer_phones
├── id
├── customer_id
├── phone_number
├── type
├── is_primary
├── created_at
└── updated_at
```

Customer notes:

```
customer_notes
├── id
├── customer_id
├── user_id
├── note
├── created_at
└── updated_at
```

### Phase 4 — Add

✅ Customer assignment · ✅ Bulk assignment · ✅ Assignment history · ✅ Customer activity · ✅ Customer notes with author/date · ✅ Customer status · ✅ Structured address · ✅ Primary phone number · ✅ Customer details page · ✅ Soft delete/deactivation

### Phase 4 — Avoid for now

❌ Customer payments · ❌ Complex CRM lead pipeline · ❌ Loyalty system · ❌ Marketing automation

### Deliverable

You can create, view, edit, search, filter, sort, paginate, assign, and deactivate customers, while maintaining multiple phone numbers, structured addresses, notes, activities, and customer history.

---

## Phase 5 — Products + Categories

### Goal

Build the product catalog before creating orders.

**Core principle: Phase 5 establishes the product foundation only — a catalog with a simple stock counter. Full inventory management (purchase orders, warehouses, batch/expiry tracking) is a separate later phase, not part of this one.**

### 1. Product List

Build:

- Search
- Pagination
- Sorting
- Filtering — Category, Status, Stock
- Stock indicator (low-stock)
- Quick actions

```
┌──────────────────────────────────────────────────────────┐
│ Products                              [+ Add Product]    │
│                                                          │
│ 🔍 Search products...   [Category] [Status] [Stock]    │
│                                                          │
│ Product      SKU       Category    Stock    Status      │
│ Product A    P-001     Feed        120      Active      │
│ Product B    P-002     Medicine     8       Low Stock  │
└──────────────────────────────────────────────────────────┘
```

**Implemented as:** `GET /api/products` accepts `search`, `categoryId`, `active`, `stock` (`low`|`out`), `sortBy` (`name`|`price`|`availableQty`|`createdAt`), `sortDir`, `page`, `pageSize`. The frontend sort dropdown offers Newest/Oldest, Name A-Z/Z-A, and Price/Stock low-to-high and high-to-low.

### 2. Add Product

Fields:

- Name
- SKU
- Category
- Description
- Price
- Unit — e.g. `1 kg`, `5 kg`, `10 kg`, `1 piece`, `1 bottle`, `1 box`. Important for this kind of application (price is per-unit, not just a bare number).
- Stock
- Minimum Stock
- Status

```
Product
Feed

Price:
₹500

Unit:
10 kg
```

### 3. Product Images

Add a main image, with optional additional images. Don't build a full media library yet — this is just image upload/display on the product record.

### 4. Product Status

Use `ACTIVE` / `INACTIVE` instead of deleting products — an old order might reference a product, and deleting it makes historical orders hard to understand.

- Active → available for new orders
- Inactive → cannot be added to new orders
- Historical orders still show the product regardless of its current status

### 5. SKU

Keep SKU, and make it unique. Don't rely on product name as the identifier.

```
PS-FD-001
PS-MD-002
PS-SU-003
```

### 6. Categories

```
Category
├── Name
├── Description
├── Status
└── Created At
```

Features: Add, Edit, Deactivate, Search. Also show product count per category:

```
Category       Products     Status
Feed              24        Active
Medicine          18        Active
Supplements       12        Active
Equipment          8        Active
```

**Implemented as:** `GET /api/categories?search=` (name search), `POST /api/categories` (auto-slugifies from name if no slug given, rejects duplicate name/slug with 409), `PATCH /api/categories/:id` (edit name/description — the frontend Edit dialog was missing in the first implementation pass and was added after an audit against this spec), `PATCH /api/categories/:id/status` (deactivate/reactivate). Product count comes from a live Prisma `_count`, not a stored/cached number.

### 7. Don't Delete Categories

Same principle as products — use **Deactivate Category**. Decide the rule for products left in a deactivated category: existing products remain associated with it, but the category can't be selected for _new_ products until reactivated.

### 8. Stock — Keep Version 1 Simple

```
Current Stock: 42
Minimum Stock: 10
```

- `stock > minimum` → Normal
- `stock < minimum` → Low Stock
- `stock == 0` → Out of Stock

### 9. Don't Build Full Inventory Yet

Leave out for now: Purchase Orders, Stock Transfers, Warehouses, Stock Adjustments, Batch Tracking, Expiry Tracking, Inventory Ledger. These can become a separate Inventory Management phase later if the business needs them.

### 10. But Prepare for Stock Changes

Structure the database so Phase 6 (Orders) can safely modify stock, even though full inventory management isn't built yet:

```
Product
   │
   ├── currentStock
   └── minimumStock
```

Later:

```
Order Created
      ↓
Stock Reserved/Deducted
      ↓
Order Cancelled
      ↓
Stock Restored
```

The exact business rule for reserve/deduct/restore gets defined in Phase 6, not here.

### 11. Product Details Page

```
Product
│
├── Overview
├── Description
├── Category
├── Pricing
├── Stock
└── Activity
```

```
┌─────────────────────────────────────────────┐
│                                             │
│              Product Image                 │
│                                             │
│ Feed Premium                                │
│ SKU: PS-FD-001                              │
│                                             │
│ ₹850 / 10 kg                                │
│                                             │
│ Category: Feed                              │
│                                             │
│ Stock: 42                                   │
│ Minimum Stock: 10                           │
│                                             │
│ ● Active                                    │
│                                             │
└─────────────────────────────────────────────┘
```

### 12. Product Activity

Keep it simple, same pattern as customer activity:

```
Activity

18 Aug
Price changed ₹800 → ₹850

17 Aug
Stock updated 25 → 42

10 Aug
Product created
```

Useful later once multiple Managers/Employees are editing products.

### 13. Product Database Structure

```
products
├── id
├── name
├── sku
├── category_id
├── description
├── price
├── unit
├── current_stock
├── minimum_stock
├── status
├── image_url
├── created_by
├── created_at
└── updated_at
```

```
categories
├── id
├── name
├── description
├── status
├── created_at
└── updated_at
```

### Phase 5 — Add

✅ Product images · ✅ Unit of measurement · ✅ Product details page · ✅ Product activity · ✅ Low-stock indicator · ✅ SKU uniqueness · ✅ Category product count · ✅ Product deactivation

### Phase 5 — Avoid for now

❌ Complex inventory ledger · ❌ Warehouse management · ❌ Purchase orders · ❌ Stock transfers · ❌ Batch/lot management · ❌ Expiry management

### Deliverable

You can manage the complete product catalog — add, edit, search, filter, sort, paginate, and deactivate products and categories, with images, units, SKUs, and a simple stock counter ready for Phase 6 to consume.

### How Phases 3–6 fit together

```
PHASE 3
Authentication
Authorization
Roles
Permissions
Employee Assignment
        │
        ▼
PHASE 4
Customer Management
        │
        ├── Customers
        ├── Phone Numbers
        ├── Addresses
        ├── Assignment
        ├── Notes
        └── Activity
        │
        ▼
PHASE 5
Product Management
        │
        ├── Products
        ├── Categories
        ├── Pricing
        ├── Images
        ├── Stock
        └── Product Activity
        │
        ▼
PHASE 6
Orders
        │
        ├── Customer
        ├── Products
        ├── Quantity
        ├── Price
        ├── Order Status
        └── Delivery
```

Keep Orders out of Phase 4 and Phase 5. Customer details can _display_ existing orders and products can be _selected_ later, but order creation/business logic itself starts in Phase 6 — this keeps each phase's foundation clean.

---

## Phase 6 — Order Management

### Goal

Build a complete Order Management module that connects the three modules already built:

```
Customer
    ↓
Order
    ↓
Products
    ↓
Payment
    ↓
Delivery
```

Phase 6 focuses on creating, managing, editing, cancelling and tracking orders.

**Important:** Basic delivery status is included here because an order needs to know its delivery state. The complete logistics system — delivery assignments, delivery attempts, proof of delivery, delivery partners, etc. — is built in Phase 7.

### 1. Order List

Create a dedicated Orders page.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Orders                                           [+ Create Order]  │
│                                                                     │
│ 🔍 Search order, customer, phone...                                │
│                                                                     │
│ [Status] [Payment] [Delivery] [Employee] [Date] [More Filters]    │
│                                                                     │
│ Order       Customer       Amount      Order       Payment Delivery│
│ #ORD-1024  Rajesh Kumar   ₹4,500      Processing  Paid    Transit │
│ #ORD-1023  Suresh Kumar   ₹2,200      Completed   Paid    Delivered│
│ #ORD-1022  Mohan Kumar    ₹1,800      Confirmed   Pending Dispatched│
└─────────────────────────────────────────────────────────────────────┘
```

#### Features

- Search
- Pagination
- Sorting
- Filtering
  - Date range
  - Customer filter
  - Employee filter
  - Order status filter
  - Payment status filter
  - Delivery status filter
  - Amount filter

#### Search by

- Order number
- Customer name
- Phone number
- SKU
- Product name

### 2. Create Order

This should be one of the most important screens.

```
Create New Order

Customer
[ Search customer... ]

────────────────────────────────

Products

Product          Qty      Price       Total

Cow Feed          2       ₹800        ₹1,600
Supplement        1       ₹500          ₹500

[ + Add Product ]

────────────────────────────────

Subtotal                           ₹2,100
Discount                            ₹100
Delivery Charge                      ₹50
Tax                                   ₹0
────────────────────────────────
Total                              ₹2,050

Payment Method
[ UPI ▼ ]

Payment Status
[ Paid ▼ ]

Delivery Address
[ Customer Address ]

Notes
[____________________________]

                [Create Order]
```

### 3. Customer Selection

The customer selection should respect the permissions created in Phase 3.

- **Admin** — can select any customer.
- **Manager** — can select customers within their allowed scope.
- **Employee** — can select only customers assigned to them.

```
Employee
    ↓
Assigned Customers
    ↓
Customer Selector
    ↓
Create Order
```

Never trust the frontend for this. The backend must verify:

```
authenticate()
      ↓
authorize("order:create")
      ↓
checkCustomerAccess()
      ↓
Create Order
```

### 4. Multiple Products Per Order

An order must support multiple products. Don't design it as `Order → Product`. Instead:

```
Order
 │
 ├── Order Item
 │      └── Product
 │
 ├── Order Item
 │      └── Product
 │
 └── Order Item
        └── Product
```

Example:

```
Order #ORD-1024

2 × Cow Feed
1 × Mineral Mix
3 × Supplement
```

### 5. Order Items

Each order item should store a snapshot of the product information: Product ID, Product Name, SKU, Quantity, Unit, Unit Price, Discount, Total.

```
Cow Feed
SKU: PS-FD-001

Quantity: 2
Unit Price: ₹800
Total: ₹1,600
```

#### Why snapshot the price?

```
Today:
Cow Feed = ₹800

Customer places an order.

Tomorrow:
Cow Feed = ₹900

The old order must still display:
2 × ₹800

not ₹900.
```

So historical order information should not depend on the current product price.

### 6. Product Selection

When adding a product:

```
[ Search product... ]
```

Show:

```
Cow Feed
SKU: PS-FD-001
₹800 / 10 kg
Stock: 42
```

After selecting:

```
Product: Cow Feed
Quantity: [ 2 ]
Price: ₹800
Total: ₹1,600
```

### 7. Stock Validation

When creating an order, check stock.

```
Current Stock: 10
Requested: 7

Allowed ✅
```

```
Current Stock: 5
Requested: 8

Not Allowed ❌
```

Show:

```
Insufficient stock.

Available: 5
Requested: 8
```

### 8. Order Pricing

Use separate fields: Subtotal, Discount, Delivery Charge, Tax, Total.

```
Subtotal = Sum(Order Items)

Total = Subtotal - Discount + Delivery Charge + Tax
```

Example:

```
Products                 ₹5,000
Discount                  ₹200
Delivery                   ₹100
Tax                          ₹0
──────────────────────────────
Total                     ₹4,900
```

### 9. Payment Status

Recommended:

```
PENDING
PARTIAL
PAID
REFUNDED
```

Don't add complicated payment states unless actually needed.

### 10. Payment Method

Support:

```
CASH
UPI
BANK_TRANSFER
OTHER
```

Later you can add online payment gateway integration.

**Important:** Payment method and payment status are different.

```
Payment Method: UPI
Payment Status: PENDING
```

or:

```
Payment Method: Cash
Payment Status: PAID
```

### 11. Order Status

Keep Order Status separate from Delivery Status.

#### Order Status

```
PENDING
CONFIRMED
PROCESSING
COMPLETED
CANCELLED
```

#### Delivery Status

```
NOT_DISPATCHED
DISPATCHED
IN_TRANSIT
DELIVERED
```

Later Phase 7 will extend delivery with `OUT_FOR_DELIVERY`, `DELIVERY_FAILED`, `RETURNED`.

> **Reconciling with the earlier, simpler naming:** `crm.md` §7-8 and the original (pre-detailed) Phase 6 draft described a single combined lifecycle — `Order Received → Dispatched → In Transit → Delivered`, with an initial status of "Arrived / Order Received". This detailed spec refines that into two independent fields: `PENDING` (Order Status) is the equivalent starting point of "Order Received", and `NOT_DISPATCHED` (Delivery Status) is its delivery-side counterpart. The single-track version is superseded by this two-track version for the reason in §12 below, but the starting semantics — "an order has just come in and nothing has shipped yet" — carry over unchanged.

### 12. Why Separate Order and Delivery Status?

```
Order Status: PROCESSING
Delivery Status: NOT_DISPATCHED
```

Later:

```
Order Status: PROCESSING
Delivery Status: IN_TRANSIT
```

Finally:

```
Order Status: COMPLETED
Delivery Status: DELIVERED
```

This prevents one status field from trying to represent two different processes.

### 13. Recommended Order Lifecycle

The normal order flow:

```
PENDING
   ↓
CONFIRMED
   ↓
PROCESSING
   ↓
COMPLETED
```

Delivery runs alongside it:

```
NOT_DISPATCHED
       ↓
DISPATCHED
       ↓
IN_TRANSIT
       ↓
DELIVERED
```

Example:

```
Order: PROCESSING
Delivery: IN_TRANSIT
```

When delivered:

```
Order: COMPLETED
Delivery: DELIVERED
```

### 14. Order Cancellation

Don't delete orders. Use `CANCELLED`. When cancelled, record: `cancelledBy`, `cancelledAt`, `cancellationReason`.

```
Order Cancelled

Reason: Customer requested cancellation
Cancelled By: Rahul Sharma
Date: 18 Aug 2026
```

### 15. Cancellation Rules

Recommend allowing cancellation only before delivery.

```
PENDING       → Can cancel
CONFIRMED     → Can cancel
PROCESSING    → Can cancel
DISPATCHED    → Restricted
IN_TRANSIT    → Cannot normally cancel
DELIVERED     → Cannot cancel
```

Later Phase 7 can handle returns separately.

### 16. Stock When Order Is Confirmed

For the first version, use a simple rule:

```
Order Confirmed
       ↓
Deduct Stock
```

Example: `Stock = 100`, `Order = 5` → after confirmation `Stock = 95`.

If the order is cancelled: `Stock = 95` → Cancel Order → `Stock = 100`.

Use a database transaction so the order and stock change succeed or fail together.

### 17. Order Editing

Order editing should depend on the order's lifecycle.

**Before processing** — allow: change quantity, add product, remove product, change discount, change delivery charge, change delivery address, add notes.

**After dispatch** (`DISPATCHED`, `IN_TRANSIT`, `DELIVERED`) — restrict major changes. Don't casually modify products, quantity, price, or customer. Use controlled cancellation/return processes instead.

### 18. Order Details Page

```
Order #ORD-1024

Status: ● Processing
Delivery: ● In Transit

────────────────────────────────────

Customer

Rajesh Kumar
📞 +91 9876543210

Narnaul, Haryana

────────────────────────────────────

Products

Cow Feed
2 × ₹800              ₹1,600

Supplement
1 × ₹500                ₹500

────────────────────────────────────

Subtotal               ₹2,100
Discount                ₹100
Delivery                 ₹50
Tax                       ₹0
────────────────────────────────────
Total                  ₹2,050

────────────────────────────────────

Payment

UPI
Paid

────────────────────────────────────

Assigned Employee

Rahul Sharma
```

### 19. Delivery Timeline on Order Details

Show basic delivery progress.

```
Order #ORD-1024

✓ Confirmed
│
✓ Processing
│
✓ Dispatched
│
● In Transit
│
○ Delivered
```

The detailed logistics system will be in Phase 7.

### 20. Delivery Address Snapshot

This is very important. When the order is created, copy the customer's address into the order. Don't rely only on `Order → Customer → Current Address`. Instead: `Order → Order Delivery Address`.

Store: `addressLine`, `landmark`, `city`, `district`, `state`, `pincode`, `country`.

Why? If Rajesh moves from Address A to Address B, the old order should still show Address A, because that's where the original order was supposed to be delivered.

### 21. Order Assignment

Orders should record who created/handled them. Store: `createdBy`, `assignedEmployeeId`.

```
Customer: Rajesh
Assigned Employee: Rahul
Order: ORD-1024
Created By: Rahul
```

This helps with accountability and reporting.

### 22. Order Activity

Every important order action should be recorded.

```
Activity

18 Aug 10:42 AM
Delivery status changed
In Transit → Delivered

18 Aug 09:30 AM
Order dispatched

17 Aug 03:20 PM
Order confirmed

17 Aug 03:10 PM
Order created
Created by Rahul Sharma
```

Track: Created, Updated, Confirmed, Cancelled, Product changed, Quantity changed, Payment updated, Delivery updated, Assignment changed.

### 23. Order Notes

Allow internal notes:

```
Order Notes

"Customer requested delivery before 12 PM."

Added by Rahul
18 Aug 2026
```

Notes should have: `userId`, `orderId`, `note`, `createdAt`. Don't overwrite the old note.

### 24. Duplicate / Reorder

Recommend adding a Reorder feature. From a customer's previous order:

```
Order #ORD-1012

[Reorder]
```

Clicking it creates a new draft/pending order with the previous products.

```
Previous Order
2 × Cow Feed
1 × Supplement

        ↓

New Order
2 × Cow Feed
1 × Supplement
```

But use the current product prices, not the old order prices. Useful for repeat customers.

### 25. Order Number

Use a human-readable order number: `ORD-2026-000001`, `ORD-2026-000002`, `ORD-2026-000003`. Don't expose only the database UUID. Keep `id` for internal database relationships and `orderNumber` for users.

### 26. Order Permissions

Connect Phase 6 directly with Phase 3. Permissions: `order:view`, `order:create`, `order:update`, `order:cancel`.

Example Employee: `order:view` ✅, `order:create` ✅, `order:update` ❌, `order:cancel` ❌.

Manager: `order:view` ✅, `order:create` ✅, `order:update` ✅, `order:cancel` ✅.

Admin: everything.

### 27. Backend Authorization

Never rely only on frontend permissions.

```
Employee clicks Edit Order
        ↓
Frontend hides/shows button
        ↓
API request
        ↓
authenticate()
        ↓
authorize("order:update")
        ↓
checkOrderAccess()
        ↓
Update Order
```

If permission is missing: `403 Forbidden`.

### 28. Order Access

Employee should not automatically see every order.

```
Manager
   │
   ├── Rahul
   │     ├── Customer A
   │     │      └── Orders
   │     └── Customer B
   │            └── Orders
   │
   └── Amit
         └── Customer C
                └── Orders
```

Rahul can only access orders he is authorized to access.

### 29. API Endpoints

#### Orders

```
GET    /api/orders
GET    /api/orders/:id
POST   /api/orders
PATCH  /api/orders/:id
POST   /api/orders/:id/cancel
POST   /api/orders/:id/reorder
```

#### Order Items

Usually these should be handled through the order API rather than exposing unnecessary independent CRUD endpoints — `PATCH /api/orders/:id` can update the order items.

#### Payment

```
PATCH /api/orders/:id/payment
```

#### Delivery

Basic Phase 6 delivery update:

```
PATCH /api/orders/:id/delivery-status
```

Phase 7 can later move this into the dedicated delivery API.

### 30. Database Structure — Orders

```
orders
├── id
├── order_number
├── customer_id
├── created_by
├── assigned_employee_id
├── order_status
├── payment_status
├── delivery_status
├── subtotal
├── discount
├── delivery_charge
├── tax
├── total
├── payment_method
├── notes
├── cancelled_by
├── cancelled_at
├── cancellation_reason
├── created_at
└── updated_at
```

### 31. Order Items

```
order_items
├── id
├── order_id
├── product_id
├── product_name
├── sku
├── quantity
├── unit
├── unit_price
├── discount
└── total
```

The `product_name`, `sku`, and `unit_price` are snapshots.

### 32. Order Address

```
order_addresses
├── id
├── order_id
├── address_line
├── landmark
├── city
├── district
├── state
├── pincode
└── country
```

### 33. Order Activity

```
order_activities
├── id
├── order_id
├── user_id
├── action
├── old_value
├── new_value
└── created_at
```

This provides the audit trail.

### 34. Order Notes

```
order_notes
├── id
├── order_id
├── user_id
├── note
└── created_at
```

### 35. Database Transactions

This is important because you're using PostgreSQL. When confirming an order:

```
BEGIN TRANSACTION

1. Check stock
2. Create/update order
3. Create order items
4. Deduct stock
5. Create activity record

COMMIT
```

If something fails: `ROLLBACK`. You don't want "Order created ✅ / Stock not deducted ❌" or "Stock deducted ✅ / Order not created ❌". The operation should be atomic.

### 36. Stock Validation

```
Product: Cow Feed
Current Stock: 20
Order Quantity: 5

20 >= 5 → Allowed.
```

```
Current Stock: 3
Order Quantity: 5

Reject:
Insufficient stock.
Available: 3
Requested: 5
```

### 37. Don't Overbuild Inventory in Phase 6

Phase 6 should consume stock, not become a full inventory system. Don't add yet: Warehouses, Stock transfers, Purchase orders, Batch management, Expiry tracking, Complex stock ledger. Those can come later in Phase 8.

### 38. Phase 6 Frontend Pages

```
/orders
/orders/new
/orders/:id
```

Potentially `/orders/:id/edit`, only when editing is allowed.

### 39. Order Page UI

Sidebar:

```
Dashboard

Customers
Products
Orders
Delivery

Employees
Reports
Settings
```

Orders page:

```
Orders
│
├── All Orders
├── Pending
├── Processing
├── Completed
└── Cancelled
```

These can be tabs/filters rather than separate pages.

### 40. Responsive Design

- **Desktop** — use a data table.
- **Tablet** — reduce columns.
- **Mobile** — convert each order into a card:

```
┌──────────────────────────────┐
│ #ORD-2026-001024             │
│                              │
│ Rajesh Kumar                 │
│ 📞 9876543210                │
│                              │
│ ₹4,500                       │
│                              │
│ ● Processing                 │
│ 🚚 In Transit                │
│                              │
│ 18 Aug 2026                  │
│                              │
│ [View Order]                 │
└──────────────────────────────┘
```

Don't force a wide desktop table onto mobile.

### 41. Motion / Animation

Use Motion carefully. Good places: order status transitions, modal opening, product adding/removing, success state, loading skeletons, page transitions. Avoid excessive animations on tables. The CRM should feel fast and professional, not like a marketing website.

### 42. Validation with Zod

Validate both frontend and backend.

**Create Order:** `customerId`, `items[]`, `paymentMethod`, `discount`, `deliveryCharge`, `address`, `notes`.

Validate: Quantity > 0, Price >= 0, Discount >= 0, Customer exists and is `ACTIVE`, Product exists and is `ACTIVE`, Address is valid, Payment method is valid. (The active-status checks were missing from this list originally — see §44.)

And importantly: **never trust the price sent by the frontend.** The backend should fetch the current product price from PostgreSQL and calculate the order total itself.

### 43. Critical Security Rule

Never do this:

```
Frontend:
product.price = ₹800
       ↓
Backend trusts ₹800
```

Instead:

```
Frontend
   ↓
productId + quantity
   ↓
Backend
   ↓
Fetch Product from PostgreSQL
   ↓
Get current price
   ↓
Calculate subtotal
   ↓
Apply discount rules
   ↓
Calculate total
   ↓
Create Order
```

This prevents users from manipulating prices through browser developer tools.

### 44. Cross-Phase Consistency Notes (gaps found and resolved before building, 2026-08-18)

Checking Phase 6 against the actual Phase 4/5 schema and code — not just reading the spec text — surfaced seven real gaps or ambiguities. All resolved here so implementation doesn't have to make these calls mid-build:

1. **`Order`'s User relations need explicit names.** `Order` currently has one _unnamed_ relation to `User` (`createdBy` ↔ `User.orders`). Adding `assignedEmployeeId` and `cancelledById` (§21, §30) means Prisma requires all three to be disambiguated with explicit `@relation` names once there's more than one FK to the same model — including retroactively naming the already-shipped `createdBy` relation. Resolved names: `"OrderCreatedBy"`, `"OrderAssignedEmployee"`, `"OrderCancelledBy"`.

2. **Order access-control derivation.** Should `checkOrderAccess` scope by the order's _own_ `assignedEmployeeId`, or by the order's customer's _live_ `assignedEmployeeId`/`assignedManagerId` (matching `checkCustomerAccess`)? These diverge the moment a customer is reassigned after the order exists. **Resolved: derive access from the order's customer's live assignment**, consistent with the "current assignment governs access, snapshots are for history/display" principle already established in Phase 3/4. `Order.assignedEmployeeId` (§21) stays a display/reporting snapshot only — it records who was handling the order, but does not itself gate access.
3. **Validation checklist (§42) omitted an active-product check.** Phase 5 §4 states inactive products "cannot be added to new orders," but §42's validation list didn't mention it. **Resolved: §42 now includes it** — see the updated list below.
4. **No stated rule for ordering against an INACTIVE customer.** Neither Phase 4 nor the original Phase 6 draft addressed this. **Resolved: block order creation for an `INACTIVE` customer**, consistent with the same active/inactive-gates-new-usage pattern already used for products and categories (Phase 5 §4/§7).
5. **Field-naming mismatch**: the existing DB column from Phase 2 is `Order.shipping`, but this spec consistently says "Delivery Charge." **Resolved: keep the existing `shipping` column name** — renaming it buys nothing but migration risk. "Delivery Charge" is the UI/spec label; `shipping` is the field.
6. **`CustomerAddress` has no `isPrimary` flag** (unlike `CustomerPhone`, which does). Phase 4's UI only ever creates one address per customer, so "snapshot the customer's address into the order" (§20) can safely take the customer's first/only address. **Resolved: acceptable for now** — this rests on current UI behavior, not a schema guarantee, so if a future phase adds multiple addresses per customer with an explicit primary flag, the order-address-snapshot logic must be revisited to select the primary one rather than the first one.
7. **`order_activities`/`order_notes` field naming** (§33, §34) says `user_id`, but every sibling model already shipped in this codebase (`CustomerNote`, `CustomerActivity`, `ProductActivity`) uses `createdById`. **Resolved: use `createdById`** for `OrderActivity`/`OrderNote` too, matching the established codebase convention over the spec's literal field name — this is a naming-style difference only, not a functional one.

(Gaps #3 and #4 are reflected directly in §42's validation list above.)

**Post-implementation audit finding (2026-08-18, resolved same day):** after Phase 6 was first marked complete, re-checking it against this section found that Payment Status had no update control anywhere in the frontend — every order is created `PENDING` (Prisma default; `CreateOrder.tsx` never collects a payment status) and `OrderDetail.tsx` only had "Mark next stage" controls for Order Status and Delivery Status, none for Payment. The backend `PATCH /orders/:id/payment` endpoint was fully built and working; it was simply never wired to any UI, meaning no order could actually be marked Paid through the app. **Resolved:** added an inline Payment Status `Select` to `OrderDetail.tsx`'s Payment card, calling the existing endpoint. Unlike Order/Delivery status, payment updates are intentionally **not** gated on `deliveryStatus === NOT_DISPATCHED` — the backend service has no such restriction, since cash-on-delivery payments are typically collected at or after delivery. Verified live via curl: status transitioned `PENDING → PAID`, correctly recorded in `OrderActivity`.

### Phase 6 Deliverable

At the end of Phase 6, you should be able to:

```
Customer
   ↓
Select Customer
   ↓
Select Products
   ↓
Enter Quantities
   ↓
Calculate Total
   ↓
Select Payment
   ↓
Create Order
   ↓
Confirm Order
   ↓
Update Basic Delivery Status
   ↓
View Order History
```

And: search orders, filter orders, edit allowed orders, cancel orders, reorder previous orders, view order details, track payment status, track basic delivery status, track order activity, respect Employee permissions, respect Customer assignment, automatically handle stock changes, maintain historical product prices, maintain historical delivery address, maintain audit history.

### Final Phase Structure

```
# Phase 6 — Order Management

## Order List
- Search
- Pagination
- Sorting
- Filtering
- Date range
- Customer filter
- Employee filter
- Order status
- Payment status
- Delivery status

## Create Order
- Authorized customer selection
- Multiple products
- Quantity
- Price snapshot
- Discount
- Delivery charge
- Tax
- Total
- Payment method
- Payment status
- Delivery address
- Notes

## Order Details
- Customer information
- Products
- Pricing
- Payment
- Order status
- Delivery status
- Delivery address
- Assigned employee
- Activity
- Notes

## Order Management
- Edit order
- Cancel order
- Reorder
- Order notes
- Activity history

## Order Status
PENDING
CONFIRMED
PROCESSING
COMPLETED
CANCELLED

## Payment
PENDING
PARTIAL
PAID
REFUNDED

## Delivery — Basic
NOT_DISPATCHED
DISPATCHED
IN_TRANSIT
DELIVERED

## Stock
- Stock validation
- Deduct on confirmation
- Restore on cancellation
- PostgreSQL transactions

## Security
- Role-based permissions
- Employee-specific permissions
- Customer assignment checks
- Order access checks
- Backend authorization
- Audit trail
```

### The most important architectural decisions in Phase 6

1. Separate Order Status, Payment Status and Delivery Status.
2. Store product price/name/SKU snapshots inside `order_items`.
3. Store the delivery-address snapshot inside the order.
4. Never trust prices or totals from the frontend.
5. Don't delete orders — cancel them.
6. Use PostgreSQL transactions when creating/confirming/cancelling orders and changing stock.
7. Keep detailed delivery/logistics functionality for Phase 7.

That gives a clean progression:

```
Phase 3 → Who can access what?
Phase 4 → Who is the customer?
Phase 5 → What products do we sell?
Phase 6 → What did the customer order?
Phase 7 → Where is that order and how was it delivered?
Phase 8 → How is inventory managed?
Phase 9 → What does the business data tell us?
```

---

## Cross-Cutting Requirement — Inline Customer Creation & Global Search

Added 2026-08-19, on top of the completed Phase 1–6 foundation. This is deliberately
**not** a numbered phase — it's a UX layer the user asked to apply to the whole
application, not a single module, so it doesn't fit the "Phase N → one deliverable"
shape used above. Full working checklist and resolved implementation decisions are in
`PHASE1-6_TODO.md`; this section is the durable spec-level summary.

### Goal

Keep the employee inside their current workflow instead of forcing a detour through
another module. Concretely: (1) let a customer be created inline wherever one is
selected — starting with Create Order — without leaving the page, and (2) give every
searchable module fast, debounced, permission-aware autocomplete, plus one global
`Ctrl+K` search across the app.

### 1. Inline customer creation

`CreateOrder`'s customer step now offers **+ Add New Customer** the moment a search
comes up empty. It opens a dialog (name, multiple phones with a primary toggle, optional
address, optional notes) and auto-selects the new customer on success — no return trip
to the Customers module. Gated by the `customer:create` permission from Phase 3 (Admin
and Manager always allowed; Employee only if granted) — checked on both the frontend
(hides the button) and the backend (the API call still enforces it independently).

The component (`CustomerPicker` + `AddCustomerDialog`) is generic — `value`/`onChange`
props, no order-specific logic — so it can be dropped into any future module that needs
to select a customer (Follow-ups, Delivery, Payments, Reports) once those modules exist,
without rework.

**Duplicate protection**: while typing the phone number, a debounced lookup checks for
an existing customer with a matching phone and shows "Customer may already exist" with
**Use Existing Customer** / **Create Anyway**. This is a soft warning, not a hard
database constraint — a unique-phone constraint would break legitimate cases like a
shared household phone across two customer records.

**Backend atomicity**: the API supports creating the customer and the order in one
transaction (`POST /orders` accepts `newCustomer` as an alternative to `customerId`,
mutually exclusive) — if either step fails, both roll back; no orphaned customer with no
order, no order referencing a half-created customer. The frontend's dialog flow doesn't
use this path today (it creates the customer via its own `POST /customers` call first,
then places the order referencing that id — see `PHASE1-6_TODO.md` §5 for why that's a
deliberate simplification, not a gap), but the atomic path is fully built, tested, and
available for any future single-step flow that needs it.

### 2. Search & autocomplete

Every page-level search (Customers, Products, Orders, Categories) is now debounced
(~300ms) — typing no longer fires one request per keystroke. Each already supported
multi-field, case-insensitive, permission-scoped search from Phases 4–6 (name, phone,
email for customers; name, SKU for products; order number, customer name/phone,
product name/SKU for orders) — search results were never fetched unfiltered to the
frontend and filtered in JavaScript; the backend always applies the same role-scoping
`list()` uses for the full page.

### 3. Global search (`Ctrl+K`)

A single navbar search bar, also reachable via `Ctrl+K`/`Cmd+K` from anywhere in the
app, queries `GET /api/search?q=` and shows grouped, debounced results — Customers,
Orders, Products, each capped at 5 with a "View all N results →" link into that
module's filtered list page. Keyboard nav: ↑/↓ moves through every result regardless of
group, Enter navigates, Esc closes. Deliveries are intentionally excluded from the
groups — Phase 7 (dedicated delivery tracking) doesn't exist yet.

The global endpoint doesn't implement its own permission logic — it calls the exact
same `customerService.list` / `productService.list` / `orderService.list` each module's
own page already uses, so a search can never surface a record the acting user isn't
otherwise allowed to see.

### 4. Explicitly out of scope for this pass

- Dedicated per-resource `/customers/search`, `/products/search`, `/orders/search`
  REST endpoints — the existing list endpoints already do permission-scoped, multi-field
  search; adding parallel routes would just duplicate that logic. Only one genuinely new
  endpoint was added (`GET /search`, for the cross-module case nothing else covers).
- A hard database-level unique constraint on customer phone numbers.
- Retrofitting the customer picker into Follow-ups/Delivery/Payments/Reports — those
  modules don't exist yet (Phases 7–12); the component is ready for them, not wired in.

---

## Phase 7 — Delivery Tracking

Now connect orders with your delivery workflow.

### Status

```
ARRIVED
   ↓
DISPATCHED
   ↓
IN_TRANSIT
   ↓
DELIVERED
```

Optional: `CANCELLED`, `RETURNED`, `DELIVERY_FAILED`

### Delivery history

Do NOT simply overwrite the status. Store:

```
Order #1025

17 Aug → Arrived
18 Aug → Dispatched
19 Aug → In Transit
21 Aug → Delivered
```

### UI

Build a visual tracker:

```
✓ Arrived
   │
✓ Dispatched
   │
● In Transit
   │
○ Delivered
```

### Deliverable

You can see exactly where every order is in the delivery process.

---

## Phase 8 — Dashboard

Only after Customers + Products + Orders + Delivery are working should you build the dashboard. The dashboard can now use real data.

### Cards

- Total Customers
- Total Orders
- Orders Arrived
- Dispatched
- In Transit
- Delivered

### Sections

- Recent orders
- Recent customers
- Orders in transit
- Today's follow-ups
- Low-stock products
- Recent activity

### Deliverable

A useful business dashboard rather than a dashboard full of fake statistics.

---

## Phase 9 — Notes + Tasks + Follow-ups

Now add customer relationship features.

### Notes

```
Customer
   ↓
Notes
```

### Tasks

```
Todo
 ↓
In Progress
 ↓
Completed
```

### Follow-ups

- Today's Follow-ups
- Upcoming
- Overdue
- Completed

Example:

```
Rajesh Kumar
📞 Call customer
Today 4:00 PM

Suresh Kumar
📞 Follow-up
Tomorrow 11:00 AM
```

### Deliverable

Employees can manage customer follow-ups and daily work.

---

## Phase 10 — Search + Advanced Filters + Import/Export

Now improve productivity.

### Global search

Search: Customer, Phone, Order ID, Product, Address, Pincode

### Advanced filters

Customers: Status, Location, Order history, Date
Orders: Delivery status, Customer, Product, Date, Amount
Products: Category, Stock, Status, Price

### CSV Import

Customer CSV: Name, Phone, Alternate Phone, Address, City, State, Pincode

Flow:

```
Upload
 ↓
Preview
 ↓
Validate
 ↓
Fix errors
 ↓
Import
```

### Export

Allow: Customer CSV, Order CSV, Product CSV

### Deliverable

Large amounts of data become easy to manage.

---

## Phase 11 — Analytics + Reports

Now that you have enough real data, build analytics.

### Customer analytics

New customers, Active customers, Customer growth, Repeat customers

### Product analytics

Best-selling products, Units sold, Revenue per product, Low-stock products

### Order analytics

Orders per month, Delivered orders, Pending orders, Average order value

### Delivery analytics

Arrived, Dispatched, In Transit, Delivered

Also calculate average delivery time, e.g.:

```
Average delivery time
3.4 days
```

### Deliverable

Management can understand business performance.

---

## Phase 12 — Notifications + Audit Logs

### Notifications

Notify users when:

- Customer assigned
- Order created
- Order dispatched
- Order delivered
- Follow-up due
- Task assigned
- Order overdue

### Audit log

Record important actions:

```
Umang created customer Rajesh Kumar

Umang created Order #1025

Rahul changed Order #1025
from Dispatched → In Transit
```

Admin can see the complete activity history.

### Deliverable

You have accountability and traceability.

---

## Phase 13 — Security + Testing

Don't leave security until the very end conceptually, but do a dedicated hardening phase here.

### Security

Implement/check: Password hashing, JWT security, Authorization, Rate limiting, CORS, Helmet, Input validation, SQL injection protection, Secure cookies where applicable, Environment secrets, Error handling, File upload validation if added.

### Testing

Backend: Auth, Customer CRUD, Product CRUD, Order creation, Order status changes, Authorization
Frontend: Login, Add customer, Add product, Create order, Update delivery, Search

---

## Phase 14 — Performance + Production

Final optimization.

### Frontend

Lazy loading, Code splitting, Query caching, Debounced search, Skeleton loaders, Optimistic updates where safe

### Backend

Database indexes, Pagination, Efficient Prisma queries, API response optimization, Rate limiting

### Production

Set up:

```
Frontend    → Production hosting
Backend     → Production server
PostgreSQL  → Managed database
```

Configure: Production environment variables, Database migrations, Logging, Error monitoring, Backups, HTTPS, CORS, Production build

---

## Phase 13 — Invoice & Payment Management (Final)

Added 2026-08-20, on top of the completed Phase 1–9 and Phase 11 foundation (Phase 10
and Phase 12 both stay deferred — nothing here depends on either). This section
records the actual recommended Phase 13, in place of the original generic "Security +
Testing" outline further up this document — that original slot's content stays as
written for history, but this is the phase that's actually being curated/built next.
Full curated build checklist lives in `PHASE13_TODO.md`; this is the durable
spec-level summary.

### Goal

Record how an order was paid: payment status, payment method, amount paid, remaining
amount, payment history, and a printable invoice. Keep it simple — this is not
accounting software.

### 1. Payment section inside Order Details

```
PAYMENT

Payment Status
🟠 Partially Paid

Paid            ₹2,000
Remaining       ₹3,000
Payment Method  UPI

[Add Payment]
```

### 2. Payment status — calculated, not entered

```
Unpaid            → ₹0 paid
Partially Paid    → 0 < paid < total
Paid              → paid ≥ total
```

The status is calculated from the payment records, not set directly.

### 3. Payment methods

Cash, UPI, Bank Transfer, Card, Other. No payment gateway integration — this phase
records payments, it doesn't process them.

### 4. Add Payment

```
ADD PAYMENT

Order Total     ₹5,000
Already Paid    ₹2,000
Remaining       ₹3,000

Amount              [ ₹2,000 ]
Payment Method      [ UPI ▼ ]
Payment Date        [ 20 Aug 2026 ]
Reference Number    [ Optional ]
Notes                [ Optional ]

[Cancel] [Save Payment]
```

### 5. Payment validation

The backend must reject a payment that would push total paid above the order total —
maximum payment is the remaining amount, unless overpayments/refunds are explicitly
supported later.

### 6. Payment history

```
PAYMENT HISTORY

Date        Method     Amount
20 Aug      UPI        ₹2,000
18 Aug      Cash       ₹1,000

Total Paid          ₹3,000
Remaining           ₹2,000
```

Each payment records: amount, method, date, reference, notes, created by, created at.

### 7. Reference number

Optional — required for none of the methods. UPI/bank transfer commonly have one,
cash commonly doesn't.

### 8. Invoice number

Every order gets an invoice number (e.g. `Order ORD-1024` → `Invoice INV-2026-1024`).
Order and Invoice stay conceptually separate: the order is the purchase, the invoice
is the financial document. One order has one invoice initially.

### 9-10. Invoice details & Print Invoice

```
PASHUSEVA

Invoice: INV-2026-1024
Date: 20 Aug 2026

Customer: Rajesh Kumar
Phone: 9876543210
Address: Narnaul, Haryana

────────────────────────────
Product        Qty       Amount
────────────────────────────
Cow Feed        5        ₹4,000
Mineral Mix     2        ₹1,000
────────────────────────────

TOTAL                   ₹5,000
PAID                    ₹3,000
BALANCE                 ₹2,000
```

Simple and clean — no complicated accounting template.

### 11. Delivery charges stay separate

Estimated Delivery Charges (added earlier, directly to Order/Order Management) must
stay out of the order total, the invoice total, and the payable/outstanding
calculation. It may be shown on the invoice "for reference only," but never folded
into what the customer owes unless that business rule is explicitly changed later.

### 12. Order Details structure

```
ORDER #1024

CUSTOMER — name, phones, address, notes
ORDER — products, quantities, order total
DELIVERY — status, article number, estimated delivery charges, location, history
PAYMENT — status, total paid, remaining, history, [+ Add Payment]
INVOICE — number, date, [Print Invoice]
ORDER HISTORY — created, edited, status/delivery/payment changes
```

### 13. Payment permissions

Admin: view/add/edit payment ✅. Manager: view/add ✅, edit depends on grant.
Employee: view ✅, add/edit ❌ by default. Uses the existing Phase 3 permission
system — `payment:view`/`payment:create`/`payment:edit` if the granularity is useful.

### 14. Payment editing — correction, not silent edit

Don't allow freely editing old payments. Instead: a mistake gets reversed (a
correction record), then the correct payment is added fresh. This preserves the
financial history instead of silently rewriting ₹2,000 into ₹1,500.

### 15-16. Customer-level payment summary

```
PURCHASE SUMMARY

Total Orders       18
Total Purchases    ₹85,500
Paid               ₹70,000
Outstanding        ₹15,500
```

Use "Outstanding Amount," not "Debt" or "Due," unless that's how the business
actually talks about it.

### 17. Dashboard addition

A couple of cards — Total Sales, Outstanding, optionally Today's Payments. Not a
separate financial dashboard.

### 18. Reports — Payments tab

```
PAYMENTS

Total Collected    ₹4,25,000
Cash                ₹1,20,000
UPI                 ₹2,50,000
Bank Transfer       ₹55,000
```

Filters: Date, Payment Method, Employee/User. Export CSV, reusing the existing
export system.

### 19-20. Database & the core financial rule

```
Order.orderTotal        → what the customer owes
Payment.amount (summed)  → money actually received
Outstanding              → orderTotal - SUM(payments)
Estimated Delivery Charges → reference only, never included
```

Paid amount is not stored as its own source of truth — it's always derived from
summing the `Payment` records, so payment history can never drift out of sync with
"how much has been paid."

### What stays deferred

Phase 10 (Notifications) and Phase 12 (Suppliers & Purchases) remain future work —
nothing in Phase 13 depends on either.

---

## Phase 14 — System Polish & Business Workflow Improvements (Final)

Added 2026-08-20, on top of the completed Phase 1–9, 11, and 13 foundation (Phase 10
and Phase 12 both stay deferred). Full curated audit — including which parts are
already satisfied by prior phases and which are real, verified gaps — lives in
`PHASE14_TODO.md`; this is the durable spec-level summary.

### Goal

Do not add a major new business module. Make the existing CRM fast, reliable,
consistent, easy to use, and production-ready — improve everything already built
rather than adding new functionality.

### 1. Global Search & Autocomplete

Search should cover Customers, Products, Orders, *and* Employees, with suggestions
appearing while typing, search across multiple relevant fields, click-to-open,
keyboard navigation (Enter to select, Esc to close), a clear-search button, and
debounced requests so typing doesn't fire a request per keystroke. One consistent
search experience throughout the application.

### 2-4. Customer, Product, and Order pages

Review and improve search/filters/sorting/pagination/empty-loading states on the
Customer and Product list+detail pages. The Order page is the most important page in
the app — keep it clearly organized (Customer / Products / Order Total / Delivery /
Payment / Order History), and make sure permitted users can easily edit customer
info, phone numbers, address, products/quantities where allowed, notes, delivery
status and transit location, article number, and estimated delivery charges, and
manage payment per their permissions. Estimated Delivery Charges stays
reference-only — never affects Order Total.

### 5. Better filters & sorting

Standardize filters across Customers (status, assigned employee, city/district),
Products (category, stock, status), Orders (order status, delivery status, employee,
date, payment status), and Reports (date range + relevant filters). Every filter
supports Apply and Clear, and it should always be obvious which filters are active.

### 6. Better form validation

Zod consistently, backend and frontend where appropriate, with specific messages —
"Phone number must contain 10 digits," not "Invalid input"; "Customer name is
required," not "Validation failed." Validate required fields, phone numbers, email,
pincode, prices, quantities, stock, payment amounts, order quantities, and article
number format where applicable.

### 7. Better error messages

Every error should say what happened, why, and what to do — "Unable to create order.
Cow Feed has only 5 units available. Reduce the quantity and try again." — not raw
technical errors like `500 Internal Server Error` or a Prisma exception name. Log
those internally; never show them directly to users.

### 8-9. Loading states, skeletons, and empty states

Every data-loading page gets a skeleton matching its actual structure, not a bare
"Loading...". Every major list gets an appropriate empty state — "No customers
found. Start by adding your first customer. [+ Add Customer]" — not a blank page.

### 10. Confirmation dialogs

Before destructive or meaningfully-impactful actions — deactivating a product or
customer, cancelling an order — not for every small action.

### 11-12. Mobile & tablet UI, responsive Order Details

Fully responsive at mobile/tablet/laptop/desktop/large-desktop. Sidebar collapses to
a ☰ menu on mobile; tables don't just overflow the screen — an order row becomes a
stacked card showing the important information first. Order Details in particular
stacks Customer / Products / Delivery / Payment / History top to bottom on mobile
rather than side by side.

### 13-14. Permission testing & backend validation/security

Thoroughly test Admin/Manager/Employee against every protected feature — Customer,
Product, Order, Employee, Payment, Reports, Settings, Audit logs — and specifically
verify the backend rejects an Employee calling an Admin-only API directly, not just
that the frontend hides the button. Every protected endpoint verifies authentication
→ role → permission → resource ownership/scope → validation → database operation, in
that order, never relying only on frontend restrictions.

### 15-16. Database & API performance

Review actual query patterns (search, filters, dashboard, reports, orders,
customers, products) and add indexes where they actually help — don't blindly index
every column. Check for unnecessary round trips; combine related data into efficient
backend endpoints where it makes sense, building on the consolidated dashboard/report
endpoints Phase 9 already introduced rather than duplicating them.

### 17. Consistent error handling

Consistent handling and user-facing translation for 400/401/403/404/409/422/500 —
"You don't have permission to perform this action," "Order #1024 could not be
found," "This phone number is already associated with another customer" — not raw
status text.

### 18-20. Consistent components, status badges, and toast feedback

Standardize reusable components (Button, Input, Select, SearchBox, DatePicker,
Table, Pagination, Badge, Card, Dialog, Dropdown, Toast, Skeleton, EmptyState,
PageHeader) so every page looks and behaves the same way. Consistent status badge
treatment for Order/Delivery/Payment statuses. Short, useful toast feedback after
actions and on errors — this is UI feedback, not the Phase 10 notification system,
which remains deferred.

### 21. Final end-to-end testing

Test the complete Customer, Product, Order, and Payment workflows end to end, and
every role against every protected feature.

### 22. Production readiness checklist

Frontend: no broken pages, no console errors, responsive at every breakpoint,
loading/empty/error states, confirmation dialogs, consistent components. Backend:
authentication/authorization verified, Zod validation, error handling, correct HTTP
status codes, resource-level authorization, secure password handling, no sensitive
data exposed. Database: important indexes, efficient queries, pagination, no
unnecessary queries, referential integrity, correct transactions. Business logic:
Customer/Product/Order/Delivery/Payment/Stock workflows tested, Reports verified,
Employee permissions verified.

### What stays deferred

Phase 10 (Notifications) and Phase 12 (Suppliers & Purchases) remain future work —
nothing in Phase 14 depends on either.

---

## Phase 15 — New User Signup & Approval Workflow (Final)

Added 2026-08-21, on top of the completed Phase 1–14 foundation. Today, every
Admin/Manager/Employee account is created *by* an Admin or Manager via
`POST /users` — there is no public signup at all. This phase adds one: a stranger
can create an account, but it starts powerless and invisible to the rest of the app
until an Admin reviews and approves it. Full curated build checklist lives in
`PHASE15_TODO.md`; this is the durable spec-level summary.

### 1. Signup is separate from being granted a role

A brand-new visitor who clicks Sign Up must never become Admin, Manager, or Employee
automatically. Signing up only creates a record — it grants nothing.

```
NEW USER
   ↓
/signup
   ↓
Create account
   ↓
Account status = PENDING
   ↓
Admin reviews
   ↓
Approve + assign role
   ↓
User can access the CRM
```

### 2. The signup form

Full Name, Phone Number, Email, Password, Confirm Password. On success:

```
Account created successfully.

Your account is waiting for approval from an administrator.
You will be able to access the CRM after your account has been approved.
```

### 3. What a PENDING account can access

```
✅ Login                          ❌ Customers / Products / Orders / Payments
✅ Logout                         ❌ Reports / Employees
✅ Their own account information  ❌ Dashboard business data
✅ Password reset/change          ❌ Settings / other users' information
```

Enforced on the backend, not just hidden in the UI — `GET /customers` (or any other
protected route) from a PENDING account must be rejected by the server regardless of
what the frontend shows.

### 4. Admin review queue

```
Users
────────────────────────────────────
Pending Approval: 3

Name          Phone        Status
Rajesh        98xxxxxx     Pending
Amit          97xxxxxx     Pending
Suresh        99xxxxxx     Pending
```

Clicking a pending user shows their details (Name, Phone, Email, Created, Status),
a Role selector (Manager / Employee), a permissions section, and
`[Reject]` / `[Approve]`.

### 5. Approving as Manager vs. Employee

**Revised — see the addendum below.** Manager access is now configurable, the same
as Employee: approving either role requires picking specific permissions (and, per
the addendum, a data scope per module) — there is no more unconditional Manager
bypass. Both `status = ACTIVE` plus the chosen `role` and the chosen grants.

### 6. What a new user is allowed to *request*, not choose

The signup form must never let a visitor pick their own final role (no "I want to
join as Admin" option — that's a privilege-escalation hole). It may optionally let
them say what they're applying for:

```
requestedRole = EMPLOYEE   (a hint for the Admin)
role = null                (nothing granted yet)
status = PENDING
```

The Admin decides the real role at approval time; `requestedRole` is never
authoritative.

### 7. Suspending and reactivating access

Admin can withdraw access from an already-active Manager or Employee, without
deleting their account or their historical records (orders they created, payments
they recorded, etc. must keep pointing at a real user, not a dangling reference).

```
Pending → (Admin approves) → Active → (Admin suspends) → Suspended → (Admin
reactivates) → Active
```

A suspended account is rejected on every subsequent request, not just at login —
the same re-check-on-every-request the app already does for account status applies
here unchanged, it just gains a new status value to check against.

### 8. Only Admin has authority over Managers

A Manager must never be able to suspend another Manager or an Admin. A Manager may
continue to manage their own Employees (this already matches the existing
`assertManagesUser` rule: a Manager can only act on a user whose `managerId` is
themself, which by construction is never another Manager or an Admin). Only Admin
can act on Managers.

### Addendum — Role + Permissions + Data Scope (added 2026-08-21)

Access is three independent layers, not two:

```
User
 │
 ├── Role            — administrative authority (Admin/Manager/Employee)
 ├── Permissions      — which business actions (View/Create/Edit/Delete per module)
 └── Data Scope        — which records (All / Assigned) per module
```

**Role controls administrative authority; permissions control business-data
access.** The two are deliberately independent — an Employee can be granted full
business permissions (View/Create/Edit on every module) without becoming a Manager
or Admin, and doing so never grants any of the following, which stay role-gated,
never permission-gated:

```
❌ Manage Admin accounts        ❌ Give yourself permissions
❌ Change system security       ❌ Suspend an Admin
❌ Change your own role
```

**Admin** gets every permission and Data Scope = All on every module, automatically
— never configured, never shown a picker for their own account.

**Manager and Employee** are both fully configurable by Admin, using the same
picker:

```
DATA ACCESS

Customers
● All Customers   ○ Assigned Customers
☑ View  ☑ Create  ☑ Edit  ☐ Delete

Orders
● All Orders      ○ Assigned Orders
☑ View  ☑ Create  ☑ Edit  ☐ Cancel

Products
● All Products                          (no Assigned option — products aren't
☑ View  ☑ Create  ☑ Edit  ☐ Deactivate    per-employee, they're company-wide)

Delivery         ☑ Update Delivery Status
Payments         ☑ View   ☐ Edit
Reports          ☑ View
```

**Presets** speed up the common cases without removing the granular picker:
Standard Employee, Standard Manager, Full Access, Custom (whatever's currently
checked). Picking a preset just pre-fills the checkboxes/radios above — Admin can
still hand-adjust anything afterward, and what's actually stored is always the
resulting permission set, never the preset's name.

A Manager can additionally be granted the authority to configure their own
Employees' permissions (a distinct, Admin-granted capability — not automatic just
from being a Manager, and separate from the business-data permissions above, since
it's about managing *other accounts*, not business data).

---

## Phase 3 Addendum — Trash / Recycle Bin & Soft Delete (Final)

Added 2026-08-21. Today, "removing" a Customer or Product means deactivating it
(`status = INACTIVE` / `active = false`) — the record stays fully visible in its own
list, just flagged, and there is no way to delete an Employee, Order, or Product at
all. This addendum adds a real, recoverable delete: a deleted record disappears from
every normal list entirely, lives in a new Admin-only Trash for 10 days, and can be
restored or permanently removed from there.

### 1. What can be deleted, and by whom

```
Admin can delete: Employees, Managers, Customers, Orders, Products
Admin cannot delete: an Admin account, ever
```

Manager/Employee access to deleting Customers/Orders/Products stays
permission-gated exactly like every other action in this app (reusing the existing
`customer:delete`/`product:deactivate` permissions, plus a new `order:delete`) — but
deleting an **Employee** is Admin-only, full stop, no permission checkbox, since it's
an administrative-authority action (removing an account), not a business-data one.

### 2. The lifecycle

```
ACTIVE → Admin deletes → TRASH → within 10 days: Restore → ACTIVE
                                → 10 days pass, no restore → permanently removed
                                → Admin explicitly Permanently Deletes → removed immediately
```

Deleting is orthogonal to a record's existing status — a Customer that was already
`INACTIVE`, or an Order that was already `CANCELLED`, can still be trashed, and
restoring returns it to whatever status it had before, not forcibly `ACTIVE`. Trash
and Deactivate/Cancel are two independent concepts, not the same button relabeled.

### 3. Historical data must survive a delete

- Deleting a **Customer** does not touch their Orders — they remain fully visible,
  showing the customer's (now-trashed) name and a "Customer deleted" indicator, not
  broken/missing data.
- Deleting a **Product** does not touch past Orders' line items — `OrderItem` already
  stores `productName`/`productSKU`/`unitPrice` as a snapshot at order-creation time
  (built in Phase 6), independent of the live `Product` row, so this already works
  today with no new work needed.
- Deleting an **Employee** does not touch Orders/activity they created — attribution
  ("Created by: Amit Kumar") must keep showing their name, not go blank.
- Deleting an Employee who currently has assigned customers or active (non-cancelled/
  non-completed) orders **requires reassigning them to another Employee first** —
  the delete flow shows the counts and blocks until that's done, rather than
  silently orphaning assignments.

### 4. Trash page (Admin-only — Manager/Employee never see it)

```
Sidebar: ... Employees, ──────, Trash (7), Settings

TRASH
[All] [Customers] [Orders] [Products] [Employees]

Item            Deleted By   Deleted On   Expires   Actions
Rajesh Kumar    Admin        Aug 21       Aug 31    [Restore] [Delete Permanently]
Order #1042     Admin        Aug 21       Aug 31    [Restore] [Delete Permanently]
```

The sidebar badge count and an in-page banner ("N items will be permanently deleted
within the next 10 days") give the Admin a clear, ambient chance to notice and
recover an accidental delete before it's gone for good.

### 5. Restore and Permanent Delete

Restore: a simple confirmation, clears `deletedAt`/`deletedBy`/`deletionExpiresAt`,
the record returns to normal immediately.

Permanent Delete: Admin-only, requires typing `DELETE` to confirm (not just a normal
confirm button) since it explicitly skips the 10-day recovery window and cannot be
undone. This is never offered as a bulk/casual action — the 10-day default path is
the one every delete takes unless the Admin deliberately opts out of it.

### 6. Automatic purge after 10 days

A backend background process (not anything the browser triggers) finds every
trashed record where `deletionExpiresAt <= now` and removes it — same operation
Permanent Delete performs on demand, just running on a schedule instead of a click.

### 7. Every deletion-related action is audited

Delete, Restore, and Permanent Delete are all sensitive enough to record: who did
it, to what, and when — reusing the existing (already-defined, currently unused)
`AuditLog` model rather than inventing a new one.

---

## 🚀 What to actually build first

Don't start with all 14 phases. The first usable version (MVP) is:

```
Phase 1 Project Setup
       ↓
Phase 2 Database
       ↓
Phase 3 Authentication
       ↓
Phase 4 Customers
       ↓
Phase 5 Products
       ↓
Phase 6 Orders
       ↓
Phase 7 Delivery
       ↓
Phase 8 Dashboard
```

That gives a complete working application: Customer → Product → Order → Delivery → Dashboard.

Then add: Tasks, Follow-ups, Notes, Analytics, Import/Export, Notifications, Audit Logs.

This is much better than spending weeks on analytics, notifications, and fancy UI before the core Customer → Order → Product → Delivery workflow works.
