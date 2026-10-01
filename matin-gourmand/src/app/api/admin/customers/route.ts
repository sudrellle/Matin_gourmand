import { errorResponse } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin(["admin"]);
    const customers = getDatabase().prepare(`
      SELECT c.id, c.first_name AS firstName, c.last_name AS lastName,
        c.email, c.phone, c.created_at AS createdAt, COUNT(o.id) AS orderCount,
        COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.total_cfa ELSE 0 END), 0) AS lifetimeValueCfa
      FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id ORDER BY c.created_at DESC LIMIT 500
    `).all();
    return Response.json({ customers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}