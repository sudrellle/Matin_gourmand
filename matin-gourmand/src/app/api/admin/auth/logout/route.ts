import { errorResponse } from "@/lib/api";
import { assertCsrf, clearAdminSession, getAdminSession, recordAudit } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertCsrf(request);
    const session = await getAdminSession();
    await clearAdminSession();
    if (session) recordAudit("ADMIN_LOGOUT", "admin", session.id, session.id, session.role, "success");
    return Response.json({ message: "Déconnexion réussie." });
  } catch (error) {
    return errorResponse(error);
  }
}