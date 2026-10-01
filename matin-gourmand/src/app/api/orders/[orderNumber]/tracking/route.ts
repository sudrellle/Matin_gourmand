import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { digest, safeEqual } from "@/lib/security";

export const runtime = "nodejs";
const tokenSchema = z.string().min(32).max(100);

export async function GET(request: Request, context: RouteContext<"/api/orders/[orderNumber]/tracking">) {
  const { orderNumber } = await context.params;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!/^MG-\d{8}-[A-F0-9]{4}$/.test(orderNumber) || !tokenSchema.safeParse(token).success) {
    return Response.json({ error: "Commande introuvable." }, { status: 404 });
  }
  const order = getDatabase().prepare(`
    SELECT o.order_number AS orderNumber, o.status, o.payment_status AS paymentStatus,
      o.subtotal_cfa AS subtotalCfa, o.delivery_fee_cfa AS deliveryFeeCfa,
      o.total_cfa AS totalCfa, o.deposit_cfa AS depositCfa, o.remaining_cfa AS remainingCfa,
      o.delivery_method AS deliveryMethod, o.delivery_zone_name AS deliveryZone,
      o.estimated_at AS estimatedAt, o.created_at AS createdAt,
      COALESCE(json_group_array(json_object('name', i.product_name, 'quantity', i.quantity,
        'unitPriceCfa', i.unit_price_cfa, 'subtotalCfa', i.subtotal_cfa))
        FILTER (WHERE i.id IS NOT NULL), '[]') AS items
    FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
    WHERE o.order_number = ? GROUP BY o.id
  `).get(orderNumber) as {
    orderNumber: string; status: string; paymentStatus: string; subtotalCfa: number;
    deliveryFeeCfa: number; totalCfa: number; depositCfa: number; remainingCfa: number;
    deliveryMethod: string; deliveryZone: string; estimatedAt: string; createdAt: string;
    items: string;
  } | undefined;
  if (!order) {
    return Response.json({ error: "Commande introuvable." }, { status: 404 });
  }
  const storedTokenHash = getDatabase().prepare("SELECT tracking_token_hash AS trackingTokenHash FROM orders WHERE order_number = ?")
    .get(orderNumber) as { trackingTokenHash: string } | undefined;
  if (!storedTokenHash || !safeEqual(digest(token), storedTokenHash.trackingTokenHash)) {
    return Response.json({ error: "Commande introuvable." }, { status: 404 });
  }
  return Response.json({ order }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}