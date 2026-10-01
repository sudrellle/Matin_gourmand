import { errorResponse } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = new Set(["created", "paid", "partially_paid", "confirmed", "preparing", "ready", "delivered", "cancelled"]);

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "all";
    const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (status !== "all" && !statuses.has(status)) return Response.json({ error: "Filtre invalide." }, { status: 400 });
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
      return Response.json({ error: "Période invalide." }, { status: 400 });
    }
    const conditions = ["1 = 1"];
    const values: Array<string | number> = [];
    if (status !== "all") { conditions.push("o.status = ?"); values.push(status); }
    if (query) { conditions.push("(o.order_number LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?)"); values.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`); }
    if (from) { conditions.push("date(o.created_at) >= date(?)"); values.push(from); }
    if (to) { conditions.push("date(o.created_at) <= date(?)"); values.push(to); }
    const orders = getDatabase().prepare(`
      SELECT o.id, o.order_number AS orderNumber, o.status, o.payment_status AS paymentStatus,
        o.subtotal_cfa AS subtotalCfa, o.delivery_fee_cfa AS deliveryFeeCfa, o.total_cfa AS totalCfa,
        o.deposit_cfa AS depositCfa, o.remaining_cfa AS remainingCfa,
        o.delivery_method AS deliveryMethod, o.delivery_zone_name AS deliveryZone,
        o.delivery_address AS deliveryAddress, o.cancellation_reason AS cancellationReason,
        o.created_at AS createdAt, c.first_name AS firstName, c.last_name AS lastName,
        c.email, c.phone,
        COALESCE(json_group_array(json_object('name', i.product_name, 'quantity', i.quantity,
          'unitPriceCfa', i.unit_price_cfa, 'subtotalCfa', i.subtotal_cfa))
          FILTER (WHERE i.id IS NOT NULL), '[]') AS items
      FROM orders o JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_items i ON i.order_id = o.id
      WHERE ${conditions.join(" AND ")}
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200
    `).all(...values);
    return Response.json({ orders }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}