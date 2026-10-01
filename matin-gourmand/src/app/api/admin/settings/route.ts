import { errorResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin(["admin"]);
    return Response.json({
      services: {
        email: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM),
        whatsapp: Boolean(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN && process.env.ADMIN_WHATSAPP),
        payment: Boolean(process.env.PAYMENT_API_URL && process.env.PAYMENT_API_KEY),
        https: process.env.NODE_ENV === "production" && Boolean(process.env.APP_ORIGIN?.startsWith("https://")),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}