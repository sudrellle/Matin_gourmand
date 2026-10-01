import "server-only";

import { randomBytes } from "node:crypto";
import { getDatabase } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/mailer";
import { openTrackingToken } from "@/lib/security";

type NotificationRow = {
  id: string;
  orderId: string;
  type: "email" | "whatsapp";
  event: "new_order" | "order_confirmation" | "status_update";
  trackingTokenEncrypted: string | null;
  recipient: string;
  retryCount: number;
  orderNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subtotalCfa: number;
  deliveryFeeCfa: number;
  totalCfa: number;
  depositCfa: number;
  remainingCfa: number;
  deliveryMethod: string;
  deliveryZoneName: string;
  deliveryAddress: string;
  paymentStatus: string;
  paymentChoice: string;
  orderStatus: string;
  createdAt: string;
  items: string;
};

const money = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} CFA`;
const dateTime = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" }).format(new Date(value));

function loadNotification(id: string) {
  return getDatabase().prepare(`
    SELECT n.id, n.order_id AS orderId, n.type, n.event, n.recipient,
      n.tracking_token_encrypted AS trackingTokenEncrypted,
      n.retry_count AS retryCount, o.order_number AS orderNumber,
      c.first_name AS firstName, c.last_name AS lastName, c.email, c.phone,
      o.subtotal_cfa AS subtotalCfa, o.delivery_fee_cfa AS deliveryFeeCfa,
      o.total_cfa AS totalCfa, o.deposit_cfa AS depositCfa,
      o.remaining_cfa AS remainingCfa, o.delivery_method AS deliveryMethod,
      o.delivery_zone_name AS deliveryZoneName, o.delivery_address AS deliveryAddress,
      o.payment_status AS paymentStatus, o.payment_choice AS paymentChoice,
      o.status AS orderStatus, o.created_at AS createdAt,
      COALESCE(json_group_array(json_object(
        'name', i.product_name, 'quantity', i.quantity,
        'unitPriceCfa', i.unit_price_cfa, 'subtotalCfa', i.subtotal_cfa
      )) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
    FROM notifications n
    JOIN orders o ON o.id = n.order_id
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_items i ON i.order_id = o.id
    WHERE n.id = ?
    GROUP BY n.id
  `).get(id) as NotificationRow | undefined;
}

function notificationText(notification: NotificationRow) {
  const items = JSON.parse(notification.items) as Array<{ name: string; quantity: number; unitPriceCfa: number; subtotalCfa: number }>;
  const lines = items.map((item) => `- ${item.name} x ${item.quantity} — ${money(item.subtotalCfa)}`).join("\n");
  const delivery = notification.deliveryMethod === "pickup" ? "Retrait en boutique" : notification.deliveryZoneName;
  const address = notification.deliveryAddress ? `\n📍 Adresse : ${notification.deliveryAddress}` : "";
  return [
    "🍰 NOUVELLE COMMANDE — MATIN GOURMAND",
    `📦 Commande : #${notification.orderNumber}`,
    `👤 Client : ${notification.firstName} ${notification.lastName}`,
    `📞 Téléphone : ${notification.phone}`,
    `✉️ Email : ${notification.email}`,
    "🛍️ Produits :",
    lines,
    `Sous-total : ${money(notification.subtotalCfa)}`,
    `🚚 Livraison (${delivery}) : ${money(notification.deliveryFeeCfa)}`,
    `💵 TOTAL : ${money(notification.totalCfa)}`,
    `💳 Acompte : ${money(notification.depositCfa)}`,
    `💰 Solde : ${money(notification.remainingCfa)}`,
    `💳 Paiement : ${notification.paymentChoice === "deposit" ? "Acompte" : "Totalité"} · ${notification.paymentStatus}`,
    address,
    `🕐 Date : ${dateTime(notification.createdAt)}`,
    "⚡ Statut : Nouvelle commande",
  ].filter(Boolean).join("\n");
}

async function deliver(notification: NotificationRow) {
  if (notification.type === "email") {
    const isAdmin = notification.event === "new_order";
    const isPaymentUpdate = notification.event === "status_update";
    const items = JSON.parse(notification.items) as Array<{ name: string; quantity: number; unitPriceCfa: number; subtotalCfa: number }>;
    const trackingUrl = !isAdmin && notification.event === "order_confirmation" && notification.trackingTokenEncrypted
      ? `${process.env.APP_ORIGIN}/suivi#${notification.orderNumber}.${openTrackingToken(notification.trackingTokenEncrypted)}`
      : undefined;
    await sendTransactionalEmail({
      to: notification.recipient,
      subject: `${isAdmin ? "Nouvelle commande" : isPaymentUpdate ? "Paiement confirmé" : "Confirmation de commande"} — ${notification.orderNumber}`,
      heading: isAdmin ? `Nouvelle commande · ${notification.orderNumber}` : isPaymentUpdate ? "Votre paiement est confirmé" : "Votre commande est bien reçue !",
      body: isAdmin
        ? `Une nouvelle commande a été passée par ${notification.firstName} ${notification.lastName}.`
        : isPaymentUpdate
          ? `Bonjour ${notification.firstName}, le paiement de votre commande ${notification.orderNumber} a bien été confirmé.`
          : `Bonjour ${notification.firstName}, votre commande ${notification.orderNumber} est enregistrée. Nous préparons la suite avec soin.`,
      items,
      trackingUrl,
      rows: isAdmin ? [
        ["N° de commande", notification.orderNumber],
        ["Date", dateTime(notification.createdAt)],
        ["Nom du client", `${notification.firstName} ${notification.lastName}`],
        ["Téléphone", notification.phone],
        ["Email client", notification.email],
        ["Sous-total", money(notification.subtotalCfa)],
        ["Mode de livraison", notification.deliveryMethod === "pickup" ? "Retrait en boutique" : `Livraison · ${notification.deliveryZoneName}`],
        ["Frais de livraison", money(notification.deliveryFeeCfa)],
        ["Adresse", notification.deliveryAddress || "Retrait en boutique"],
        ["Total commande", money(notification.totalCfa)],
        ["Acompte à régler", money(notification.depositCfa)],
        ["Solde restant", money(notification.remainingCfa)],
        ["Mode de paiement", notification.paymentChoice === "deposit" ? "Acompte de 50 %" : "Paiement intégral"],
        ["Statut du paiement", notification.paymentStatus],
        ["Statut", notification.orderStatus],
      ] : [
        ["N° de commande", notification.orderNumber],
        ["Date", dateTime(notification.createdAt)],
        ["Mode de réception", notification.deliveryMethod === "pickup" ? "Retrait en boutique" : notification.deliveryZoneName],
        ["Sous-total", money(notification.subtotalCfa)],
        ["Frais de livraison", money(notification.deliveryFeeCfa)],
        ["Total commande", money(notification.totalCfa)],
        ["Acompte", money(notification.depositCfa)],
        ["Solde restant", money(notification.remainingCfa)],
        ["Paiement", notification.paymentStatus],
      ],
    });
    return;
  }

  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!url || !token || !url.startsWith("https://")) throw new Error("whatsapp_unavailable");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: notification.recipient, type: "text", text: { body: notificationText(notification) } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`whatsapp_http_${response.status}`);
}

export async function dispatchNotification(id: string) {
  const database = getDatabase();
  const notification = loadNotification(id);
  if (!notification) return false;
  if (notification.retryCount >= 3) return false;

  database.prepare("UPDATE notifications SET retry_count = retry_count + 1 WHERE id = ?").run(id);
  try {
    await deliver(notification);
    database.prepare("UPDATE notifications SET status = 'sent', sent_at = ?, error_message = NULL WHERE id = ?")
      .run(new Date().toISOString(), id);
    return true;
  } catch {
    database.prepare("UPDATE notifications SET status = 'failed', error_message = ?, sent_at = NULL WHERE id = ?")
      .run("Échec temporaire du prestataire. Réessayez plus tard.", id);
    return false;
  }
}

export async function dispatchOrderNotifications(orderId: string) {
  const ids = getDatabase().prepare("SELECT id FROM notifications WHERE order_id = ? AND status = 'pending'")
    .all(orderId) as Array<{ id: string }>;
  await Promise.all(ids.map((notification) => dispatchNotification(notification.id)));
}

export function newNotificationId() {
  return randomBytes(16).toString("hex");
}