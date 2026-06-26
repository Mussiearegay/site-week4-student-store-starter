// Product model: wraps all database operations for products using Prisma Client.
// Each method maps to one CRUD action. Routes call these so route handlers stay thin.

const prisma = require('../src/db/db')

class Product {
  // READ all — returns products, optionally filtered by category and sorted.
  // Accepts { category, sort } (both optional). Builds Prisma query options dynamically.
  static async list({ category, sort } = {}) {
    const query = {}

    // Filter: only add a `where` clause if a category was provided.
    if (category) {
      query.where = {
        category: { equals: category, mode: 'insensitive' }, // case-insensitive match
      }
    }

    // Sort: only allow known fields; ignore anything else.
    if (sort === 'price' || sort === 'name') {
      query.orderBy = { [sort]: 'asc' }
    }

    return prisma.product.findMany(query)
  }

  // READ one — returns a single product by id, or null if none exists
  static async get(id) {
    return prisma.product.findUnique({ where: { id } })
  }

  // CREATE — inserts a new product and returns it (with its new id)
  static async create({ name, description, price, imageUrl, category }) {
    return prisma.product.create({
      data: { name, description, price, imageUrl, category },
    })
  }

  // UPDATE — changes an existing product by id and returns the updated row
  static async update(id, { name, description, price, imageUrl, category }) {
    return prisma.product.update({
      where: { id },
      data: { name, description, price, imageUrl, category },
    })
  }

  // DELETE — removes a product by id
  static async remove(id) {
    return prisma.product.delete({ where: { id } })
  }
}

module.exports = Product
