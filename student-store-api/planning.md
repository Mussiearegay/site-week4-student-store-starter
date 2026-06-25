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
- **Request:** none (no body, no params).
- **Success:** `200 OK`, body is a list of product objects: `[ { id, name, description, price, imageUrl, category }, ... ]`
- **Error:** `500` `{ "error": "..." }` if the database read fails.

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

#### GET /orders — fetch all orders
- **Request:** none.
- **Success:** `200 OK`, body is a list of order objects: `[ { id, customer, totalPrice, status, createdAt }, ... ]`
- **Error:** `500` `{ "error": "..." }` if the database read fails.

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
  ```json
  {
    "customer": 101,
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
   - Create the Order row (`customer`, calculated `totalPrice`, `status` defaults to "pending", `createdAt` defaults to now()).
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

