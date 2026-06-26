// OrderItem model: wraps database operations for order items using Prisma Client.
// Order items are the individual lines on an order (which product, how many, at what price).

const prisma = require('../src/db/db')

class OrderItem {
  // READ all — returns every order item (used by the stretch GET /order-items endpoint)
  static async list() {
    return prisma.orderItem.findMany()
  }

  // READ all for one order — returns the items belonging to a given order
  static async listForOrder(orderId) {
    return prisma.orderItem.findMany({ where: { orderId } })
  }

  // CREATE — inserts a single order item linked to an order and a product
  static async create({ orderId, productId, quantity, price }) {
    return prisma.orderItem.create({
      data: { orderId, productId, quantity, price },
    })
  }
}

module.exports = OrderItem
