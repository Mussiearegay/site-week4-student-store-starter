# Student Store — System Spec (planning.md)

This document is the source of truth for the database schema and API routes.
Written before any code so that implementation is just translation, not decision-making.

---

## Section 1: Data Models

### Product

Represents a single item for sale in the store.

| Field | Prisma type | Required? | Default | Notes |
|-------|-------------|-----------|---------|-------|
| id | Int | auto | autoincrement() | Primary key |
| name | String | required | — | |
| description | String | required | — | |
| price | Float | required | — | Decimal, e.g. 29.99 |
| imageUrl | String | required | — | Maps to `image_url` |
| category | String | required | — | |

- **Primary key:** `id`, auto-increments.
- **Relationships:** has many `OrderItem` records (a product can appear in many orders).
- **Cascade behavior:** when a Product is deleted, all OrderItems referencing it are also deleted.

### Order

Represents a single purchase (one receipt). Can contain many OrderItems.

| Field | Prisma type | Required? | Default | Notes |
|-------|-------------|-----------|---------|-------|
| id | Int | auto | autoincrement() | Primary key (the `order_id`) |
| customer | Int | required | — | The `customer_id` |
| email | String? | optional | — | Email of the person who placed the order. Used by the `GET /orders?email=` filter. Optional so older orders without an email still validate. |
| totalPrice | Float | required | — | Sum of all its order items |
| status | String | required | "pending" | New orders start as "pending" |
| createdAt | DateTime | — | now() | Stamped once when the order is created; never changes |

- **Primary key:** `id`, auto-increments.
- **Relationships:** has many `OrderItem` records.
- **Cascade behavior:** when an Order is deleted, all OrderItems referencing it are also deleted.

### OrderItem

Represents a single line on an order (e.g. "2 × College Hoodie @ $29.99").
Sits at the intersection of two relationships: it belongs to one Order and points to one Product.

| Field | Prisma type | Required? | Default | Notes |
|-------|-------------|-----------|---------|-------|
| id | Int | auto | autoincrement() | Primary key (the `order_item_id`) |
| orderId | Int | required | — | Foreign key → which Order this line belongs to |
| productId | Int | required | — | Foreign key → which Product this line is |
| quantity | Int | required | — | Whole number (can't buy 2.5 of an item) |
| price | Float | required | — | Snapshot of the product price at purchase time |

- **Primary key:** `id`, auto-increments.
- **Relationships (two foreign keys):**
  - `orderId` → belongs to one `Order`
  - `productId` → references one `Product`
- **Cascade behavior (OrderItem is the child in both relationships):**
  - When its parent `Order` is deleted, this OrderItem is deleted too.
  - When its referenced `Product` is deleted, this OrderItem is deleted too.

### Cascade rules summary (the dependency chain)

OrderItem depends on both Order and Product. Deleting either parent removes the
OrderItems that reference it:

```
Product ──(deleted)──► its OrderItems deleted
Order   ──(deleted)──► its OrderItems deleted
```

In Prisma this is expressed with `onDelete: Cascade` on the OrderItem's relation
fields (we'll write that in schema.prisma during the schema milestone).

---

## Section 2: API Contract

**Consistent error shape (entire API):** every error response is a JSON object
with a single `error` key: `{ "error": "message describing what went wrong" }`.

### Product Endpoints

#### GET /products — fetch all products
- **Request:** optional query parameters (see below).
- **Success:** `200 OK`, body is a list of product objects: `[ { id, name, description, price, imageUrl, category }, ... ]`
- **Error:** `500` `{ "error": "..." }` if the database read fails.

- **Query Parameters:**
  | Param | Example | Behavior |
  |-------|---------|----------|
  | `category` | `?category=Apparel` | Filter to products whose `category` exactly matches (case-insensitive). |
  | `sort` | `?sort=price` or `?sort=name` | Order results ascending by the given field. Allowed values: `price`, `name`. Unknown values are ignored (no ordering applied). |
  - Both can be combined: `?category=Apparel&sort=price`.
  - **Default (no params):** return all products, unordered.
  - **Invalid category** (no products match): return `200 OK` with an empty list `[]` (not an error — it's a valid query that simply matched nothing).

#### GET /products/:id — fetch one product by id
- **Request:** route param `:id` (the product's id, e.g. `/products/3`).
- **Success:** `200 OK`, body is a single product object: `{ id, name, description, price, imageUrl, category }`
- **Error:** `404 Not Found` `{ "error": "Product not found" }` if no product has that id.

#### POST /products — create a new product
- **Request body:** all product fields except `id` (the database assigns the id):
  `{ name, description, price, imageUrl, category }`
- **Success:** `201 Created`, body is the newly created product including its new `id`:
  `{ id, name, description, price, imageUrl, category }`
- **Error:** `400 Bad Request` `{ "error": "Invalid request body" }` if a required field is missing/invalid.

#### PUT /products/:id — update an existing product
- **Request:** route param `:id` (which product) + request body with the fields to update:
  `{ name, description, price, imageUrl, category }`
- **Success:** `200 OK`, body is the full updated product: `{ id, name, description, price, imageUrl, category }`
- **Error:** `404 Not Found` `{ "error": "Product not found" }` if no product has that id.

#### DELETE /products/:id — remove a product
- **Request:** route param `:id` only (no body needed — you just point at which product).
- **Success:** `200 OK`, body `{ "success": "Successfully deleted product" }`
- **Error:** `404 Not Found` `{ "error": "Product not found" }` if no product has that id.
- **Cascade:** deleting the product automatically deletes every OrderItem that referenced it (no orphaned rows).

### Order Endpoints

#### GET /orders — fetch all orders (optional ?email= filter)
- **Request:** optional query parameter (see below).
- **Success:** `200 OK`, body is a list of order objects: `[ { id, customer, email, totalPrice, status, createdAt }, ... ]`
- **Error:** `500` `{ "error": "..." }` if the database read fails.

- **Query Parameters:**
  | Param | Example | Behavior |
  |-------|---------|----------|
  | `email` | `?email=jordan` | Filter to orders whose `email` **contains** the value (case-insensitive partial match). `?email=jo` matches `jordan@school.edu`. |
  - **Default (no param):** return all orders.
  - **No matches:** return `200 OK` with an empty list `[]` (a valid query that matched nothing, not an error).

#### GET /orders/:order_id — fetch one order, including its items
- **Request:** route param `:order_id`.
- **Success:** `200 OK`, body is the order object with its OrderItems nested inside as an `orderItems` array:
  ```json
  {
    "id": 1, "customer": 101, "totalPrice": 89.97, "status": "completed",
    "createdAt": "2023-04-06T10:00:00Z",
    "orderItems": [
      { "id": 1, "orderId": 1, "productId": 1, "quantity": 2, "price": 29.99 }
    ]
  }
  ```
  (In Prisma, fetched using `include: { orderItems: true }`.)
- **Error:** `404 Not Found` `{ "error": "Order not found" }` if no order has that id.

#### PUT /orders/:order_id — update an order (e.g. change status)
- **Request:** route param `:order_id` + body with fields to change, commonly `{ "status": "completed" }`.
- **Success:** `200 OK`, body is the full updated order: `{ id, customer, totalPrice, status, createdAt }`
- **Error:** `404 Not Found` `{ "error": "Order not found" }` if no order has that id.

#### POST /orders — create a new order with its items
- **Request body:** order info + an array of items to buy. The caller does NOT send
  `id`, `status`, `createdAt`, the per-item `price`, or `totalPrice` — the server fills those in.
  `email` is optional (used later by the `GET /orders?email=` filter).
  ```json
  {
    "customer": 101,
    "email": "jordan@school.edu",
    "orderItems": [
      { "productId": 1, "quantity": 2 },
      { "productId": 4, "quantity": 1 }
    ]
  }
  ```
- **Server responsibilities:** look up each product's real price in the DB, set each
  OrderItem's `price` from it, and calculate `totalPrice = sum(price × quantity)`.
  Never trust a total sent by the caller (they could underpay).
- **Success:** `201 Created`, body is the created order with its items and calculated total nested in:
  ```json
  {
    "id": 3, "customer": 101, "totalPrice": 89.97, "status": "pending",
    "createdAt": "...",
    "orderItems": [
      { "id": 5, "orderId": 3, "productId": 1, "quantity": 2, "price": 29.99 },
      { "id": 6, "orderId": 3, "productId": 4, "quantity": 1, "price": 1.99 }
    ]
  }
  ```
- **Error:** `400 Bad Request` `{ "error": "..." }` if the body is invalid or an item
  references a product that doesn't exist. (See Section 3 for the full flow.)

#### DELETE /orders/:order_id — remove an order
- **Request:** route param `:order_id` only (no body).
- **Success:** `200 OK`, body `{ "success": "Successfully deleted order" }`
- **Error:** `404 Not Found` `{ "error": "Order not found" }` if no order has that id.
- **Cascade:** deleting the order automatically deletes every OrderItem that belongs to it.

### Order Item Endpoints (stretch)

#### GET /order-items — fetch all order items
- **Request:** none.
- **Success:** `200 OK`, body is a list of order item objects: `[ { id, orderId, productId, quantity, price }, ... ]`
- **Error:** `500` `{ "error": "..." }` if the database read fails.

#### POST /orders/:order_id/items — add an item to an existing order
- **Request:** route param `:order_id` + body `{ productId, quantity }`. The caller does
  NOT send `price` — the server looks up the product's real price (same trust rule as POST /orders).
- **Server responsibilities:** create the OrderItem with `price` = the product's current price,
  then bump the parent order's `totalPrice` by `price × quantity` so the order stays consistent.
- **Success:** `201 Created`, body is the created order item: `{ id, orderId, productId, quantity, price }`
- **Errors:**
  - `400 Bad Request` `{ "error": "Invalid request body" }` if `productId` or `quantity` is missing.
  - `400 Bad Request` `{ "error": "Product <id> not found" }` if the product doesn't exist.
  - `404 Not Found` `{ "error": "Order not found" }` if the order doesn't exist.

---

## Section 3: Transactional Flow — POST /orders

`POST /orders` writes to two tables at once (Order + OrderItems), so it must run
as a **transaction**: all writes succeed together, or none do (no half-created orders).

### Request body
```json
{
  "customer": 101,
  "orderItems": [
    { "productId": 1, "quantity": 2 },
    { "productId": 4, "quantity": 1 }
  ]
}
```
The caller sends only `customer` and a list of `{ productId, quantity }`.
The server fills in everything else (id, status, createdAt, each item's price, totalPrice).

### Step-by-step at the data layer
1. **Validate the body.** Confirm `customer` and a non-empty `orderItems` array are present.
   If not → `400 Bad Request` `{ "error": "Invalid request body" }`. Stop here.
2. **Look up each product.** For every item, fetch the product by `productId` from the DB.
   - If any productId does not exist → `400 Bad Request` `{ "error": "Product <id> not found" }`. Stop before creating anything.
   - This look-up also gives the *real, trusted price* for each product (never trust a price from the caller).
3. **Calculate the total.** `totalPrice = sum(product.price × item.quantity)` across all items.
4. **Create everything in one transaction** (`prisma.$transaction`):
   - Create the Order row (`customer`, optional `email`, calculated `totalPrice`, `status` defaults to "pending", `createdAt` defaults to now()).
   - Create each OrderItem row, linked to the new order's id, with `price` = the looked-up product price (a snapshot).
   - Because it's one transaction, if creating any OrderItem fails, the Order and any
     already-created items are rolled back — the database ends up as if nothing happened.
5. **Respond.** `201 Created`, body = the created order with its `orderItems` array nested in
   (same shape as `GET /orders/:order_id`).

### What if item #3 references a nonexistent product?
The product look-up in step 2 happens *before* any writes, so the request is rejected
with `400` and **nothing is created** — no Order, no OrderItems. If a failure somehow
occurred mid-write instead, the `$transaction` wrapper rolls back items #1 and #2 too,
so there is never a partially-created order.

---

## Decisions Log — Product Model

- **Schema translation that went smoothly**: `price` as `Float` — Prisma's `Float`
  maps cleanly to PostgreSQL's double precision and handles currency values like
  `29.99` without extra configuration. `id Int @id @default(autoincrement())`
  translated 1:1 from the spec's "primary key, auto-increment" note.

- **Field decision made during implementation that wasn't in the original spec**:
  Kept `imageUrl` as **required** (no `?`) to match the spec decision that every
  product must have an image. The route's validation enforces this too — `POST /products`
  rejects a body missing `imageUrl` with `400`, rather than relying only on the DB.

- **Route behavior that needed a spec update**: None needed. Spec said `PUT /products/:id`
  returns `200` with the full updated product and `DELETE` returns `200` with
  `{ "success": "Successfully deleted product" }` — both implemented and confirmed
  against the contract, no change required. Added an explicit existence check before
  PUT/DELETE so a missing id returns the spec's `404 { "error": "Product not found" }`
  instead of a raw Prisma error.

---

## Spec Reconciliation — Milestone 4 (Schema Audit)

### Schema vs. spec gaps found
- **No gaps found — schema matched spec exactly.** OrderItem has all five fields
  (`id`, `orderId`, `productId`, `quantity`, `price`) with the documented types, the
  two foreign-key relationships to Order and Product, and `onDelete: Cascade` on both.
- Added clarifying comments in `schema.prisma` (e.g. `price` = "snapshot of the product's
  price at the time of purchase") to match the spec's intent — field type was already correct.
- Confirmed no extra fields exist in the schema that aren't in the spec, and no spec
  fields are missing from the schema.

### Cascade delete verification
- Deleting a Product removes associated OrderItems: ✅ tested (2 items → 1 after deleting a referenced product)
- Deleting an Order removes associated OrderItems: ✅ tested (1 item → 0 after deleting the order)
- DB-level check: both foreign keys show `ON DELETE CASCADE` in the `OrderItem` table.

---

## Decisions Log — Order Creation Transaction

- **What my Transactional Flow spec got right**: The step-by-step order of operations was
  accurate — validate the body, look up every product first (which also yields the trusted
  prices), calculate `totalPrice` from those prices, then create the Order and its OrderItems
  inside one transaction, and return the order with items included. Calculating the total
  server-side (never trusting the caller) was the right call and dropped straight into code.

- **What the spec missed that I discovered during implementation**: The spec said to validate
  a "non-empty orderItems array" but didn't spell out per-item validation. Added a check that
  every item has both a `productId` and a `quantity` (→ `400 Invalid request body`). Also, the
  product look-up happens *before* the transaction, so an invalid productId is rejected without
  any writes at all — the `$transaction` rollback is a second layer of safety for mid-write failures.

- **How the transaction error handling works**: `prisma.$transaction(async (tx) => { ... })`
  runs all the writes inside the callback as a single atomic unit, using the transactional
  client `tx`. If any operation inside throws (or I throw manually), Prisma rolls back every
  write that happened in that block — the database ends up exactly as it was before. That's why
  a failure can never leave a half-created order (an Order row with only some of its items).

- **One thing I'd design differently if starting over**: I'd validate all productIds and build
  the priced items in the same query rather than a separate findMany + loop, and consider
  returning a richer error (e.g. listing *all* missing productIds at once, not just the first),
  so the caller can fix their whole cart in one round-trip instead of one bad id at a time.

---

## Final Spec Reconciliation: Project Complete

### Full-system audit result
- **All required endpoints match the API contract.** Five product endpoints + five order
  endpoints behave exactly as documented (status codes, request/response shapes, error cases),
  verified by Postman/curl tests across all milestones.
- **The complete user flow works**: `GET /products` → browse → add to cart → `POST /orders`
  → server calculates `totalPrice`, creates the order + items atomically, returns the order
  with its `orderItems` nested in (matches `GET /orders/:id` shape).
- **CORS**: the spec didn't originally document CORS. Added an implementation note — the
  backend enables `app.use(cors())` so the frontend (origin `http://localhost:5173`) can call
  the API (origin `http://localhost:3000`). Confirmed `Access-Control-Allow-Origin` is returned.
- **States handled**: empty cart / empty `orderItems` → `400 Invalid request body`; nonexistent
  `productId` → `400 Product <id> not found` with no partial records; missing product on a
  fetch → `404 Product not found`. All defined in the spec and implemented.

### Gaps resolved during frontend integration
- **`imageUrl` vs `image_url`**: the API returns `imageUrl` (camelCase) but the React
  components read `image_url` (snake_case). Resolved on the frontend by mapping the field once
  at the fetch boundary in `App.jsx` (`{ ...p, image_url: p.imageUrl }`), leaving the API and
  the rest of the UI untouched.
- **Cart shape vs order body**: the cart is `{ productId: quantity }`; `POST /orders` expects
  `{ customer, orderItems: [{ productId, quantity }] }`. Resolved by transforming the cart into
  `orderItems` inside `handleOnCheckout` before posting.
- **Unwired starter UI**: the starter `App.jsx` had no data fetching and an empty checkout
  handler. Added a `useEffect` to fetch products on load and implemented `handleOnCheckout`.
- **`CheckoutSuccess` receipt shape**: the component optionally reads `order.purchase.receipt`,
  which the API doesn't return. It degrades gracefully to a confirmation message, so no API
  change was needed (noted as a possible stretch enhancement).

### What the spec enabled during this project
Writing the contract first meant each route was a translation task, not a design decision —
status codes and response shapes were already settled, so implementation and Postman testing
went quickly. The Transactional Flow spec in particular made the hardest endpoint (`POST /orders`)
straightforward: the order of operations, the server-side total calculation, and the
no-partial-records guarantee were all decided on paper before any code was written.

---

## Stretch Features — Implementation Log

### Added Endpoints
- **GET /orders** (all orders) and **GET /orders/:order_id** (single order with items)
  already existed from the core build — no new backend work needed, just confirmed against
  the contract.

### Filter Orders by Email
- **Schema change:** added an optional `email String?` field to the `Order` model
  (migration `add_order_email`). Made it **optional** so existing orders without an email
  still validate and the migration applies cleanly to a populated table.
- **Backend:** `GET /orders` now accepts `?email=` and filters with Prisma's
  `{ email: { contains, mode: 'insensitive' } }` — a **partial, case-insensitive** match,
  so `?email=jo` finds `jordan@school.edu`. `POST /orders` and `PUT /orders/:id` now accept
  and persist `email`; the seed data includes sample emails.
- **Why partial match:** it backs a live search box on the Past Orders page (type a few
  letters, results narrow) rather than requiring the exact full address.

### Frontend — Past Orders
- **`/orders`** (`Orders.jsx`): lists every past order; an email input re-queries the API
  (`GET /orders?email=`) so filtering happens server-side. Each row links to its detail page.
- **`/orders/:orderId`** (`OrderDetail.jsx`): shows one order's status, date, email, customer,
  and a line-item table. It fetches the order *and* the product list in parallel so it can
  display product **names** (the order's `orderItems` carry only `productId`).
- **Routing note:** `/orders` and `/orders/:orderId` are declared before the catch-all
  `/:productId` route so React Router matches them first.
- A **Past Orders** link was added to the SubNavbar so the page is reachable.

### Checkout form
- Added an **Email** field to `PaymentInfo.jsx` and sent it through `handleOnCheckout`,
  so orders placed in the UI are now filterable by email.

