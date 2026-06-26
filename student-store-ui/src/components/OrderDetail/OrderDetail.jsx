import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { formatPrice, formatDate } from "../../utils/format";
import "./OrderDetail.css";

// Base URL of the backend API.
const API_BASE_URL = "http://localhost:3000";

// Detailed view of one past order, reached by clicking a row on the Orders page.
function OrderDetail() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  // Map of productId -> product, so we can show item names (the order's
  // orderItems only carry productId, not the product name).
  const [productsById, setProductsById] = useState({});
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOrder = async () => {
      setIsFetching(true);
      setError(null);
      try {
        // Fetch the order (with its items) and the product list in parallel.
        const [orderRes, productsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/orders/${orderId}`),
          axios.get(`${API_BASE_URL}/products`),
        ]);
        setOrder(orderRes.data);
        const lookup = {};
        for (const p of productsRes.data) lookup[p.id] = p;
        setProductsById(lookup);
      } catch (err) {
        setError("Failed to load this order.");
      } finally {
        setIsFetching(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (isFetching) return <div className="OrderDetail"><p>Loading order…</p></div>;
  if (error) return <div className="OrderDetail"><p className="error">{error}</p><Link to="/orders">← Back to orders</Link></div>;
  if (!order) return null;

  return (
    <div className="OrderDetail">
      <Link to="/orders" className="back-link">← Back to orders</Link>

      <h1>Order #{order.id}</h1>
      <div className="order-meta">
        <span><strong>Status:</strong> <span className={`status status-${order.status}`}>{order.status}</span></span>
        <span><strong>Placed:</strong> {formatDate(order.createdAt)}</span>
        <span><strong>Email:</strong> {order.email || "—"}</span>
        <span><strong>Customer ID:</strong> {order.customer}</span>
      </div>

      <table className="items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="center">Qty</th>
            <th className="right">Unit Price</th>
            <th className="right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {order.orderItems?.map((item) => {
            const product = productsById[item.productId];
            return (
              <tr key={item.id}>
                <td>{product ? product.name : `Product #${item.productId}`}</td>
                <td className="center">{item.quantity}</td>
                <td className="right">{formatPrice(item.price)}</td>
                <td className="right">{formatPrice(item.price * item.quantity)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="right"><strong>Total</strong></td>
            <td className="right"><strong>{formatPrice(order.totalPrice)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default OrderDetail;
