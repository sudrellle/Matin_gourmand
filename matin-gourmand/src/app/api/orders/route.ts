import { randomBytes } from "node:crypto";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { dispatchOrderNotifications } from "@/lib/notifications";
import {
  assertSameOrigin,
  digest,
  enforceRateLimit,
  sealTrackingToken,
  recordAudit,
  requestAddress,
} from "@/lib/security";

export const runtime = "nodejs";

const orderSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^\+?[0-9 .()-]{8,20}$/),
  items: z.array(z.object({ id: z.string().regex(/^product-[a-z0-9-]{1,60}$/), quantity: z.number().int().min(1).max(30) }).strict()).min(1).max(30),
  paymentChoice: z.enum(["deposit", "full"]),
  deliveryMethod: z.enum(["pickup", "delivery"]),
  deliveryZoneId: z.string().regex(/^[a-z0-9-]{1,80}$/),
  deliveryAddress: z.string().trim().max(300).optional().default(""),
}).strict();

type ProductRow = {
  id: string;
  name: string;
  priceCfa: number;
  quantity: number;
  available: number;
};
type ZoneRow = {
  id: string;
  name: string;
  feeCfa: number;
  minimumHours: number;
  maximumHours: number;
  kind: "pickup" | "delivery";
  active: number;
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    enforceRateLimit(`create-order:${requestAddress(request)}`, 5, 10 * 60 * 1000);
    const parsed = await readJson(request, orderSchema);
    if (!parsed.success) return Response.json({ error: "Vérifiez les informations de votre commande." }, { status: 400 });

    const quantities = new Map<string, number>();
    for (const item of parsed.data.items) {
      quantities.set(item.id, (quantities.get(item.id) || 0) + item.quantity);
    }

    const database = getDatabase();
    const transaction = database.transaction(() => {
      const zone = database.prepare(`
        SELECT id, name, fee_cfa AS feeCfa, minimum_hours AS minimumHours,
          maximum_hours AS maximumHours, kind, active
        FROM delivery_zones WHERE id = ? AND deleted_at IS NULL
      `).get(parsed.data.deliveryZoneId) as ZoneRow | undefined;
      if (!zone || !zone.active || zone.kind !== parsed.data.deliveryMethod) {
        throw new Error("DELIVERY_UNAVAILABLE");
      }
      if (parsed.data.deliveryMethod === "delivery" && parsed.data.deliveryAddress.length < 8) {
        throw new Error("ADDRESS_REQUIRED");
      }

      const getProduct = database.prepare(`
        SELECT id, name, price_cfa AS priceCfa, quantity, available
        FROM products WHERE id = ? AND deleted_at IS NULL
      `);
      const decrementStock = database.prepare(`
        UPDATE products SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND available = 1 AND quantity >= ? AND deleted_at IS NULL
      `);
      const lineItems: Array<{ id: string; name: string; quantity: number; unitPrice: number; subtotal: number }> = [];
      let subtotal = 0;
      for (const [productId, quantity] of quantities) {
        const product = getProduct.get(productId) as ProductRow | undefined;
        if (!product || !product.available || product.quantity < quantity) {
          throw new Error(`PRODUCT_UNAVAILABLE:${productId}`);
        }
        const lineTotal = product.priceCfa * quantity;
        subtotal += lineTotal;
        if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotal) || subtotal > 1_000_000_000) {
          throw new Error("TOTAL_INVALID");
        }
        if (decrementStock.run(quantity, productId, quantity).changes !== 1) {
          throw new Error(`PRODUCT_UNAVAILABLE:${productId}`);
        }
        lineItems.push({ id: product.id, name: product.name, quantity, unitPrice: product.priceCfa, subtotal: lineTotal });
      }

      const deliveryFee = zone.feeCfa;
      const total = subtotal + deliveryFee;
      const deposit = parsed.data.paymentChoice === "deposit" ? Math.ceil(total / 2) : total;
      const remaining = total - deposit;
      const customerId = randomBytes(16).toString("hex");
      const orderId = randomBytes(16).toString("hex");
      const trackingToken = randomBytes(32).toString("base64url");
      const createdAt = new Date();
      const dateCode = createdAt.toISOString().slice(0, 10).replaceAll("-", "");
      const orderNumber = `MG-${dateCode}-${randomBytes(2).toString("hex").toUpperCase()}`;
      const estimatedAt = new Date(createdAt.getTime() + zone.minimumHours * 60 * 60 * 1000).toISOString();

      database.prepare(`
        INSERT INTO customers (id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email, phone) DO NOTHING
      `).run(customerId, parsed.data.firstName, parsed.data.lastName, parsed.data.email.toLowerCase(), parsed.data.phone);
      const customer = database.prepare("SELECT id FROM customers WHERE email = ? AND phone = ?")
        .get(parsed.data.email.toLowerCase(), parsed.data.phone) as { id: string };

      database.prepare(`
        INSERT INTO orders (
          id, order_number, tracking_token_hash, customer_id, status, payment_status,
          subtotal_cfa, delivery_fee_cfa, total_cfa, deposit_cfa, remaining_cfa,
          payment_choice, delivery_method, delivery_zone_id, delivery_zone_name,
          delivery_address, estimated_at
        ) VALUES (?, ?, ?, ?, 'created', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId, orderNumber, digest(trackingToken), customer.id, subtotal, deliveryFee,
        total, deposit, remaining, parsed.data.paymentChoice, zone.kind, zone.id,
        zone.name, parsed.data.deliveryAddress, estimatedAt,
      );

      const addLine = database.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price_cfa, subtotal_cfa)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const line of lineItems) {
        addLine.run(randomBytes(16).toString("hex"), orderId, line.id, line.name, line.quantity, line.unitPrice, line.subtotal);
      }

      database.prepare(`
        INSERT INTO payments (id, order_id, amount_cfa, type, status)
        VALUES (?, ?, ?, ?, 'pending')
      `).run(randomBytes(16).toString("hex"), orderId, deposit, parsed.data.paymentChoice);

      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const adminWhatsApp = process.env.ADMIN_WHATSAPP?.trim();
      const createNotification = database.prepare(`
        INSERT INTO notifications (id, order_id, type, event, recipient, status, tracking_token_encrypted)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `);
      if (adminEmail) createNotification.run(randomBytes(16).toString("hex"), orderId, "email", "new_order", adminEmail, null);
      createNotification.run(randomBytes(16).toString("hex"), orderId, "email", "order_confirmation", parsed.data.email.toLowerCase(), sealTrackingToken(trackingToken));
      if (adminWhatsApp) createNotification.run(randomBytes(16).toString("hex"), orderId, "whatsapp", "new_order", adminWhatsApp, null);

      recordAudit("ORDER_CREATED", "order", orderId, null, "customer", "success", { orderNumber });
      return {
        orderId,
        orderNumber,
        trackingToken,
        subtotalCfa: subtotal,
        deliveryFeeCfa: deliveryFee,
        totalCfa: total,
        depositCfa: deposit,
        remainingCfa: remaining,
        paymentChoice: parsed.data.paymentChoice,
        paymentStatus: "pending",
        status: "created",
        deliveryMethod: zone.kind,
        deliveryZone: zone.name,
        estimatedAt,
        items: lineItems.map((line) => ({ name: line.name, quantity: line.quantity, unitPriceCfa: line.unitPrice, subtotalCfa: line.subtotal })),
      };
    });

    const order = transaction();
    await dispatchOrderNotifications(order.orderId);
    return Response.json({ order }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PRODUCT_UNAVAILABLE:")) {
      return Response.json({ error: "Un produit n’est plus disponible dans la quantité demandée." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "DELIVERY_UNAVAILABLE") {
      return Response.json({ error: "Ce mode de livraison n’est plus disponible." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ADDRESS_REQUIRED") {
      return Response.json({ error: "Ajoutez une adresse de livraison complète." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "TOTAL_INVALID") {
      return Response.json({ error: "Le montant de votre commande est invalide." }, { status: 400 });
    }
    return errorResponse(error);
  }
}