import { cookies } from "next/headers";
import { errorResponse } from "@/lib/api";
import { getAdminSession } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) return Response.json({ error: "Non authentifié." }, { status: 401 });
    const cookieStore = await cookies();
    const csrfToken = cookieStore.get("mg_csrf")?.value;
    return Response.json({ session, csrfToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}