import { errorResponse } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const database = getDatabase();
    const today = database.prepare(`
      SELECT COUNT(*) AS orderCount, COALESCE(SUM(total_cfa), 0) AS revenueCfa,
        SUM(CASE WHEN status = 'created' THEN 1 ELSE 0 END) AS newOrders,
        SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) AS preparingOrders,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS readyOrders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS deliveredOrders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledOrders
      FROM orders WHERE date(created_at) = date('now', 'localtime')
    `).get();
    const payments = database.prepare(`
      SELECT COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_cfa ELSE 0 END), 0) AS receivedCfa,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cfa ELSE 0 END), 0) AS pendingCfa
      FROM payments
    `).get();
    const popularProducts = database.prepare(`
      SELECT product_name AS name, SUM(quantity) AS quantity, SUM(subtotal_cfa) AS revenueCfa
      FROM order_items GROUP BY product_id ORDER BY quantity DESC LIMIT 5
    `).all();
    const dailyRevenue = database.prepare(`
      SELECT date(created_at) AS date, SUM(total_cfa) AS revenueCfa
      FROM orders WHERE status <> 'cancelled' AND created_at >= datetime('now', '-6 days')
      GROUP BY date(created_at) ORDER BY date(created_at)
    `).all();
    return Response.json({ today, payments, popularProducts, dailyRevenue }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}