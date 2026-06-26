// Order model: wraps all database operations for orders using Prisma Client.
// Each method maps to one CRUD action. Routes call these so route handlers stay thin.

const prisma = require('../src/db/db')

class Order {
  // READ all — returns every order, optionally filtered by the email of the
  // person who placed it. Accepts { email } (optional). The match is partial
  // and case-insensitive, so `?email=jo` matches "jo@x.com" and "John@y.com".
  static async list({ email } = {}) {
    const query = {}

    if (email) {
      query.where = {
        email: { contains: email, mode: 'insensitive' },
      }
    }

    return prisma.order.findMany(query)
  }

  // READ one — returns a single order by id with its order items nested in
  // (Prisma's `include` pulls the related OrderItem rows into an `orderItems` array),
  // or null if no order has that id.
  static async get(id) {
    return prisma.order.findUnique({
      where: { id },
      include: { orderItems: true },
    })
  }

  // CREATE — inserts a new order and returns it (with its new id).
  // status defaults to "pending" and createdAt to now() at the DB level.
  static async create({ customer, email, totalPrice, status }) {
    return prisma.order.create({
      data: { customer, email, totalPrice, status },
    })
  }

  // CREATE WITH ITEMS (transactional) — the main order-creation flow.
  // Takes { customer, orderItems: [{ productId, quantity }] }.
  // Looks up each product's real price, calculates the total, and creates the
  // Order + all its OrderItems atomically (all succeed or none do).
  //
  // Throws an Error with a `.status` of 400 if an item references a product that
  // does not exist — the route turns that into the spec's error response.
  static async createWithItems({ customer, email, orderItems }) {
    // Step 2: look up every product so we get its real, trusted price.
    const productIds = orderItems.map((item) => item.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    })

    // Build a quick lookup map: productId -> product
    const productById = new Map(products.map((p) => [p.id, p]))

    // If any productId in the request has no matching product, reject before writing.
    for (const item of orderItems) {
      if (!productById.has(item.productId)) {
        const err = new Error(`Product ${item.productId} not found`)
        err.status = 400
        throw err
      }
    }

    // Step 3: calculate the total from the looked-up prices (never trust the caller).
    const itemsWithPrice = orderItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: productById.get(item.productId).price,
    }))
    const totalPrice = itemsWithPrice.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )

    // Step 4: create the order and its items in a single transaction.
    // prisma.$transaction runs the callback as one atomic unit: every write inside
    // uses the transactional client `tx`, and if anything throws, ALL of them roll
    // back together (no half-created order).
    return prisma.$transaction(async (tx) => {
      // Create the Order row first so we have its id to link items to.
      const order = await tx.order.create({
        data: { customer, email, totalPrice },
      })

      // Create each OrderItem, linked to the new order's id.
      for (const item of itemsWithPrice) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          },
        })
      }

      // Return the order with its items nested in (matches GET /orders/:id shape).
      return tx.order.findUnique({
        where: { id: order.id },
        include: { orderItems: true },
      })
    })
  }

  // UPDATE — changes an existing order by id (e.g. status) and returns the updated row.
  static async update(id, { customer, email, totalPrice, status }) {
    return prisma.order.update({
      where: { id },
      data: { customer, email, totalPrice, status },
    })
  }

  // DELETE — removes an order by id
  static async remove(id) {
    return prisma.order.delete({ where: { id } })
  }
}

module.exports = Order
