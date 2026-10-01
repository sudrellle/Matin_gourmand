import { randomBytes } from "node:crypto";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { digest, enforceRateLimit, recordAudit, requestAddress, safeEqual } from "@/lib/security";

export const runtime = "nodejs";
type Context = { params: Promise<{ orderNumber: string }> };
const paymentSchema = z.object({ trackingToken: z.string().min(32).max(100) }).strict();

export async function POST(request: Request, context: Context) {
  try {
    const origin = request.headers.get("origin");
    const expectedOrigin = process.env.APP_ORIGIN || (process.env.NODE_ENV === "production" ? "" : new URL(request.url).origin);
    if (!origin || origin !== expectedOrigin) return Response.json({ error: "Requête refusée." }, { status: 403 });
    enforceRateLimit(`payment:${requestAddress(request)}`, 5, 15 * 60 * 1000);
    const parsed = await readJson(request, paymentSchema);
    if (!parsed.success) return Response.json({ error: "Commande introuvable." }, { status: 400 });
    const { orderNumber } = await context.params;
    if (!/^MG-\d{8}-[A-F0-9]{4}$/.test(orderNumber)) return Response.json({ error: "Commande introuvable." }, { status: 404 });

    const database = getDatabase();
    const order = database.prepare(`
      SELECT o.id, o.order_number AS orderNumber, o.tracking_token_hash AS trackingTokenHash,
        o.deposit_cfa AS amountCfa, o.payment_choice AS paymentChoice, o.payment_status AS paymentStatus,
        c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_number = ?
    `).get(orderNumber) as { id: string; orderNumber: string; trackingTokenHash: string; amountCfa: number; paymentChoice: string; paymentStatus: string; phone: string } | undefined;
    if (!order || !safeEqual(digest(parsed.data.trackingToken), order.trackingTokenHash)) {
      return Response.json({ error: "Commande introuvable." }, { status: 404 });
    }
    if (order.paymentStatus === "paid") return Response.json({ error: "Cette commande est déjà payée." }, { status: 409 });
    const apiUrl = process.env.PAYMENT_API_URL;
    const apiKey = process.env.PAYMENT_API_KEY;
    if (!apiUrl || !apiKey || !apiUrl.startsWith("https://")) {
      return Response.json({ error: "Le paiement Mobile Money n’est pas encore configuré." }, { status: 503 });
    }
    const attempts = database.prepare("SELECT COUNT(*) AS count FROM payments WHERE order_id = ? AND status IN ('pending', 'failed')").get(order.id) as { count: number };
    if (attempts.count >= 3) return Response.json({ error: "Le nombre de tentatives de paiement est épuisé." }, { status: 429 });

    const merchantReference = `pay_${randomBytes(16).toString("hex")}`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: order.amountCfa,
        currency: "XOF",
        reference: merchantReference,
        customer: { phone: order.phone },
        callback_url: `${expectedOrigin}/api/webhooks/payment`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      recordAudit("PAYMENT_INITIATION_FAILED", "order", order.id, null, "customer", "failure");
      return Response.json({ error: "Le service de paiement est momentanément indisponible." }, { status: 503 });
    }
    const providerResult = await response.json() as { checkout_url?: string; reference?: string };
    if (!providerResult.checkout_url || !providerResult.checkout_url.startsWith("https://") || !providerResult.reference) {
      recordAudit("PAYMENT_INITIATION_FAILED", "order", order.id, null, "customer", "failure");
      return Response.json({ error: "Le service de paiement a renvoyé une réponse invalide." }, { status: 502 });
    }
    database.transaction(() => {
      const pending = database.prepare("SELECT id FROM payments WHERE order_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(order.id) as { id: string } | undefined;
      if (pending) database.prepare("UPDATE payments SET provider_reference = ? WHERE id = ?").run(providerResult.reference, pending.id);
      else database.prepare("INSERT INTO payments (id, order_id, amount_cfa, type, status, provider_reference) VALUES (?, ?, ?, ?, 'pending', ?)")
        .run(randomBytes(16).toString("hex"), order.id, order.amountCfa, order.paymentChoice, providerResult.reference);
      database.prepare("UPDATE orders SET payment_attempts = payment_attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
    })();
    recordAudit("PAYMENT_INITIATED", "order", order.id, null, "customer", "success");
    return Response.json({ checkoutUrl: providerResult.checkout_url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return Response.json({ error: "Le service de paiement est momentanément indisponible." }, { status: 503 });
    return errorResponse(error);
  }
}