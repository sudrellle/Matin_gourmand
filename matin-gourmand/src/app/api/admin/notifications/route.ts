import { errorResponse } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const notifications = getDatabase().prepare(`
      SELECT n.id, n.type, n.event, n.recipient, n.status,
        n.sent_at AS sentAt, n.error_message AS errorMessage,
        n.retry_count AS retryCount, n.created_at AS createdAt,
        o.order_number AS orderNumber
      FROM notifications n JOIN orders o ON o.id = n.order_id
      ORDER BY n.created_at DESC LIMIT 150
    `).all();
    return Response.json({ notifications }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}