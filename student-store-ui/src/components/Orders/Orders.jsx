import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { formatPrice, formatDate } from "../../utils/format";
import "./Orders.css";

// Base URL of the backend API (same Express server the rest of the app talks to).
const API_BASE_URL = "http://localhost:3000";

// Past Orders page — lists every order and lets the user filter by email.
function Orders() {
  const [orders, setOrders] = useState([]);
  const [emailFilter, setEmailFilter] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);

  // Re-fetch whenever the email filter changes. The backend does the filtering
  // via GET /orders?email=, so the input value is sent straight to the API.
  useEffect(() => {
    const fetchOrders = async () => {
      setIsFetching(true);
      setError(null);
      try {
        const url = emailFilter
          ? `${API_BASE_URL}/orders?email=${encodeURIComponent(emailFilter)}`
          : `${API_BASE_URL}/orders`;
        const { data } = await axios.get(url);
        setOrders(data);
      } catch (err) {
        setError("Failed to load orders.");
      } finally {
        setIsFetching(false);
      }
    };

    fetchOrders();
  }, [emailFilter]);

  return (
    <div className="Orders">
      <h1>Past Orders</h1>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Filter by email…"
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}
      {isFetching ? (
        <p>Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="empty">No orders found.</p>
      ) : (
        <div className="order-list">
          {orders.map((order) => (
            <Link to={`/orders/${order.id}`} className="order-row" key={order.id}>
              <span className="order-id">Order #{order.id}</span>
              <span className="order-email">{order.email || "—"}</span>
              <span className="order-date">{formatDate(order.createdAt)}</span>
              <span className={`order-status status-${order.status}`}>{order.status}</span>
              <span className="order-total">{formatPrice(order.totalPrice)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Orders;
