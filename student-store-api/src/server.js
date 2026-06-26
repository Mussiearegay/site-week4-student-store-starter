const express = require('express');
const cors = require('cors');
const Product = require('../models/product');
const Order = require('../models/order');
const OrderItem = require('../models/orderItem');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());          // lets the frontend (a different origin) call this API
app.use(express.json());  // parses incoming JSON request bodies into req.body

// Health-check / test route
app.get('/', (req, res) => {
    res.send('Express server is successfully running');
});

// ----- Product Endpoints -----

// GET /products — fetch all products (optional ?category= and ?sort= filters)
app.get('/products', async (req, res) => {
    try {
        const { category, sort } = req.query;
        const products = await Product.list({ category, sort });
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// GET /products/:id — fetch one product by id
app.get('/products/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const product = await Product.get(id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

// POST /products — create a new product
app.post('/products', async (req, res) => {
    try {
        const { name, description, price, imageUrl, category } = req.body;
        if (!name || !description || price == null || !imageUrl || !category) {
            return res.status(400).json({ error: 'Invalid request body' });
        }
        const product = await Product.create({ name, description, price, imageUrl, category });
        res.status(201).json(product);
    } catch (err) {
        res.status(400).json({ error: 'Invalid request body' });
    }
});

// PUT /products/:id — update an existing product
app.put('/products/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const existing = await Product.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const { name, description, price, imageUrl, category } = req.body;
        const product = await Product.update(id, { name, description, price, imageUrl, category });
        res.status(200).json(product);
    } catch (err) {
        res.status(400).json({ error: 'Invalid request body' });
    }
});

// DELETE /products/:id — remove a product
app.delete('/products/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const existing = await Product.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Product not found' });
        }
        await Product.remove(id);
        res.status(200).json({ success: 'Successfully deleted product' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// ----- Order Endpoints -----

// GET /orders — fetch all orders (optional ?email= filter)
app.get('/orders', async (req, res) => {
    try {
        const { email } = req.query;
        const orders = await Order.list({ email });
        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// GET /orders/:order_id — fetch one order by id
app.get('/orders/:order_id', async (req, res) => {
    try {
        const id = Number(req.params.order_id);
        const order = await Order.get(id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.status(200).json(order);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// POST /orders — create a new order with its items (transactional)
app.post('/orders', async (req, res) => {
    try {
        const { customer, email, orderItems } = req.body;
        // Step 1: validate — need a customer and a non-empty array of items.
        if (customer == null || !Array.isArray(orderItems) || orderItems.length === 0) {
            return res.status(400).json({ error: 'Invalid request body' });
        }
        // Each item must have a productId and a quantity.
        const itemsValid = orderItems.every(
            (item) => item && item.productId != null && item.quantity != null
        );
        if (!itemsValid) {
            return res.status(400).json({ error: 'Invalid request body' });
        }

        const order = await Order.createWithItems({ customer, email, orderItems });
        res.status(201).json(order);
    } catch (err) {
        // A productId that doesn't exist throws an error tagged with status 400.
        if (err.status === 400) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// PUT /orders/:order_id — update an order (e.g. change status)
app.put('/orders/:order_id', async (req, res) => {
    try {
        const id = Number(req.params.order_id);
        const existing = await Order.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const { customer, email, totalPrice, status } = req.body;
        const order = await Order.update(id, { customer, email, totalPrice, status });
        res.status(200).json(order);
    } catch (err) {
        res.status(400).json({ error: 'Invalid request body' });
    }
});

// DELETE /orders/:order_id — remove an order
app.delete('/orders/:order_id', async (req, res) => {
    try {
        const id = Number(req.params.order_id);
        const existing = await Order.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Order not found' });
        }
        await Order.remove(id);
        res.status(200).json({ success: 'Successfully deleted order' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

// ----- Order Item Endpoints (stretch) -----

// GET /order-items — fetch every order item in the database
app.get('/order-items', async (req, res) => {
    try {
        const orderItems = await OrderItem.list();
        res.status(200).json(orderItems);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch order items' });
    }
});

// POST /orders/:order_id/items — add a new item to an existing order.
// The caller sends { productId, quantity }. As with POST /orders, the server
// looks up the product's real price (never trusts the caller) and keeps the
// order's totalPrice in sync.
app.post('/orders/:order_id/items', async (req, res) => {
    try {
        const orderId = Number(req.params.order_id);
        const { productId, quantity } = req.body;

        // Validate the body.
        if (productId == null || quantity == null) {
            return res.status(400).json({ error: 'Invalid request body' });
        }

        // The order must exist.
        const order = await Order.get(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // The product must exist — its price becomes the line item's price snapshot.
        const product = await Product.get(Number(productId));
        if (!product) {
            return res.status(400).json({ error: `Product ${productId} not found` });
        }

        // Create the item and bump the order total by (price × quantity).
        const orderItem = await OrderItem.create({
            orderId,
            productId: Number(productId),
            quantity: Number(quantity),
            price: product.price,
        });
        await Order.update(orderId, {
            totalPrice: order.totalPrice + product.price * Number(quantity),
        });

        res.status(201).json(orderItem);
    } catch (err) {
        res.status(500).json({ error: 'Failed to add order item' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
