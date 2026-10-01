import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const updateSchema = z.object({
  status: z.enum(["confirmed", "preparing", "ready", "delivered", "cancelled"]),
  cancellationReason: z.string().trim().min(10).max(500).optional(),
}).strict();

const transitions: Record<string, string[]> = {
  created: ["cancelled"],
  paid: ["confirmed", "cancelled"],
  partially_paid: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export async function PATCH(request: Request, context: Context) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin();
    const { id } = await context.params;
    const parsed = await readJson(request, updateSchema);
    if (!parsed.success) return Response.json({ error: "Vérifiez le statut et le motif." }, { status: 400 });
    const { status, cancellationReason } = parsed.data;
    if (status === "cancelled" && (!cancellationReason || cancellationReason.length < 10)) {
      return Response.json({ error: "Le motif d’annulation doit contenir au moins 10 caractères." }, { status: 400 });
    }
    if (status === "cancelled" && admin.role !== "admin") {
      return Response.json({ error: "Seul un administrateur peut annuler une commande." }, { status: 403 });
    }
    const database = getDatabase();
    const current = database.prepare("SELECT status, payment_status AS paymentStatus, order_number AS orderNumber FROM orders WHERE id = ?")
      .get(id) as { status: string; paymentStatus: string; orderNumber: string } | undefined;
    if (!current) return Response.json({ error: "Commande introuvable." }, { status: 404 });
    if (!transitions[current.status]?.includes(status)) return Response.json({ error: "Cette transition de statut n’est pas autorisée." }, { status: 409 });
    if (status === "confirmed" && current.paymentStatus === "pending") {
      return Response.json({ error: "La commande doit avoir reçu un paiement avant d’être confirmée." }, { status: 409 });
    }

    database.transaction(() => {
      database.prepare(`
        UPDATE orders SET status = ?, cancellation_reason = ?, cancelled_by = ?,
          cancelled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(status, status === "cancelled" ? cancellationReason : null,
        status === "cancelled" ? admin.id : null, status === "cancelled" ? new Date().toISOString() : null, id);
      if (status === "cancelled") {
        const paidAmount = database.prepare("SELECT COALESCE(SUM(amount_cfa), 0) AS amount FROM payments WHERE order_id = ? AND status = 'succeeded' AND type <> 'refund'")
          .get(id) as { amount: number };
        if (paidAmount.amount > 0) {
          database.prepare("INSERT INTO payments (id, order_id, amount_cfa, type, status) VALUES (?, ?, ?, 'refund', 'pending')")
            .run(crypto.randomUUID(), id, paidAmount.amount);
        }
        database.prepare("UPDATE products SET quantity = quantity + (SELECT quantity FROM order_items WHERE order_id = ? AND product_id = products.id), updated_at = CURRENT_TIMESTAMP WHERE id IN (SELECT product_id FROM order_items WHERE order_id = ?)")
          .run(id, id);
      }
      recordAudit(status === "cancelled" ? "ORDER_CANCELLED" : "ORDER_STATUS_CHANGED", "order", id,
        admin.id, admin.role, "success", { from: current.status, to: status, reason: cancellationReason || "" });
    })();
    return Response.json({ message: status === "cancelled" ? "Commande annulée." : "Statut de commande mis à jour." });
  } catch (error) {
    return errorResponse(error);
  }
}