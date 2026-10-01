import { errorResponse } from "@/lib/api";
import { dispatchNotification } from "@/lib/notifications";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const { id } = await context.params;
    const result = await dispatchNotification(id);
    recordAudit("NOTIFICATION_RETRIED", "notification", id, admin.id, admin.role, result ? "success" : "failure");
    return Response.json(
      { message: result ? "Notification envoyée." : "Le prestataire est toujours indisponible ou la limite de tentatives est atteinte." },
      { status: result ? 200 : 503 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}