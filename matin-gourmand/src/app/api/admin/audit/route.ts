import { errorResponse } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin(["admin"]);
    const logs = getDatabase().prepare(`
      SELECT a.id, a.action, a.entity, a.entity_id AS entityId,
        a.actor_role AS actorRole, a.result, a.context,
        a.created_at AS createdAt, admins.email AS actorEmail
      FROM audit_logs a LEFT JOIN admins ON admins.id = a.admin_id
      ORDER BY a.created_at DESC LIMIT 500
    `).all();
    return Response.json({ logs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}