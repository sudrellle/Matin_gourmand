import { createHmac, timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/lib/db";
import { dispatchOrderNotifications, newNotificationId } from "@/lib/notifications";
import { recordAudit } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return Response.json({ error: "Webhook non configuré." }, { status: 503 });
  const signature = request.headers.get("x-payment-signature") || "";
  const raw = await request.text();
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return Response.json({ error: "Signature invalide." }, { status: 401 });
  }

  let payload: { reference?: string; status?: string };
  try {
    payload = JSON.parse(raw) as { reference?: string; status?: string };
  } catch {
    return Response.json({ error: "Événement invalide." }, { status: 400 });
  }
  if (!payload.reference || !["succeeded", "failed"].includes(payload.status || "")) {
    return Response.json({ error: "Événement invalide." }, { status: 400 });
  }

  const database = getDatabase();
  const payment = database.prepare(`
    SELECT payments.id, payments.order_id AS orderId, payments.amount_cfa AS amountCfa,
      orders.total_cfa AS totalCfa, payments.status AS paymentStatus,
      customers.email
    FROM payments JOIN orders ON orders.id = payments.order_id
    JOIN customers ON customers.id = orders.customer_id
    WHERE payments.provider_reference = ?
  `).get(payload.reference) as { id: string; orderId: string; amountCfa: number; totalCfa: number; paymentStatus: string; email: string } | undefined;
  if (!payment) return Response.json({ error: "Paiement introuvable." }, { status: 404 });
  if (payment.paymentStatus !== "pending") return Response.json({ received: true });

  database.transaction(() => {
    const updated = database.prepare("UPDATE payments SET status = ? WHERE id = ? AND status = 'pending'")
      .run(payload.status, payment.id);
    if (updated.changes !== 1) return;
    if (payload.status === "succeeded") {
      const paid = database.prepare("SELECT COALESCE(SUM(amount_cfa), 0) AS total FROM payments WHERE order_id = ? AND status = 'succeeded' AND type <> 'refund'")
        .get(payment.orderId) as { total: number };
      const paymentStatus = paid.total >= payment.totalCfa ? "paid" : "partial";
      const orderStatus = paid.total >= payment.totalCfa ? "paid" : "partially_paid";
      database.prepare("UPDATE orders SET payment_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('cancelled', 'delivered')")
        .run(paymentStatus, orderStatus, payment.orderId);
      database.prepare(`INSERT INTO notifications (id, order_id, type, event, recipient, status)
        VALUES (?, ?, 'email', 'status_update', ?, 'pending')`)
        .run(newNotificationId(), payment.orderId, payment.email);
      recordAudit("PAYMENT_SUCCESS", "order", payment.orderId, null, "payment_provider", "success", { amountCfa: payment.amountCfa });
    } else {
      database.prepare("UPDATE orders SET payment_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status = 'pending'")
        .run(payment.orderId);
      recordAudit("PAYMENT_FAILED", "order", payment.orderId, null, "payment_provider", "failure");
    }
  })();

  if (payload.status === "succeeded") await dispatchOrderNotifications(payment.orderId);
  return Response.json({ received: true });
}