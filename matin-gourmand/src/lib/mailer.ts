import "server-only";

import nodemailer from "nodemailer";
import { join } from "node:path";

function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !password || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Service d’email non configuré.");
  }
  return {
    from,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
    }),
  };
}

export async function sendAdminOtp(email: string, code: string) {
  const mailer = getMailer();
  await mailer.transporter.sendMail({
    from: mailer.from,
    to: email,
    subject: "Votre code de connexion — Matin Gourmand",
    text: `Votre code de connexion expire dans 2 minutes. Ne le partagez avec personne.\n\n${code}`,
    html: `<div style="font-family:Arial,sans-serif;color:#1c2b24;max-width:520px;margin:auto;padding:32px"><p style="color:#66806d;letter-spacing:.14em;font-size:11px">MATIN GOURMAND · ESPACE BOUTIQUE</p><h1 style="font-family:Georgia,serif;font-weight:500">Votre code de connexion</h1><p>Ce code est valable pendant 2 minutes et ne peut être utilisé qu’une seule fois.</p><p style="font-size:30px;letter-spacing:.25em;font-weight:bold;padding:18px 0">${code}</p><p style="font-size:12px;color:#777d72">Ne partagez jamais ce code. Si vous n’avez pas demandé de connexion, ignorez cet email.</p></div>`,
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  heading: string;
  body: string;
  rows: Array<[string, string]>;
  items?: Array<{ name: string; quantity: number; unitPriceCfa: number; subtotalCfa: number }>;
  trackingUrl?: string;
}) {
  const mailer = getMailer();
  const currency = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} CFA`;
  const rows = input.rows.map(([label, value]) =>
    `<tr><td style="padding:10px 0;color:#69766b;border-bottom:1px solid #e9ede5">${escapeHtml(label)}</td><td style="padding:10px 0;text-align:right;color:#263e31;font-weight:700;border-bottom:1px solid #e9ede5">${escapeHtml(value)}</td></tr>`,
  ).join("");
  const itemRows = (input.items || []).map((item) =>
    `<tr><td style="padding:11px 8px 11px 0;color:#34463a;border-bottom:1px solid #e9ede5">${escapeHtml(item.name)}</td><td style="padding:11px 8px;color:#69766b;text-align:center;border-bottom:1px solid #e9ede5">${item.quantity}</td><td style="padding:11px 0;color:#69766b;text-align:right;border-bottom:1px solid #e9ede5">${escapeHtml(currency(item.unitPriceCfa))}</td><td style="padding:11px 0 11px 8px;color:#263e31;text-align:right;font-weight:700;border-bottom:1px solid #e9ede5">${escapeHtml(currency(item.subtotalCfa))}</td></tr>`,
  ).join("");
  const itemTable = itemRows
    ? `<h2 style="margin:26px 0 9px;color:#263e31;font-family:Georgia,serif;font-size:18px;font-weight:500">Articles commandés</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px"><thead><tr><th align="left" style="padding:9px 8px 9px 0;color:#849084;border-bottom:1px solid #dfe5dc;font-size:10px;font-weight:600">Article</th><th align="center" style="padding:9px 8px;color:#849084;border-bottom:1px solid #dfe5dc;font-size:10px;font-weight:600">Qté</th><th align="right" style="padding:9px 0;color:#849084;border-bottom:1px solid #dfe5dc;font-size:10px;font-weight:600">Prix unitaire</th><th align="right" style="padding:9px 0 9px 8px;color:#849084;border-bottom:1px solid #dfe5dc;font-size:10px;font-weight:600">Total</th></tr></thead><tbody>${itemRows}</tbody></table>`
    : "";
  const logoPath = join(process.cwd(), "public", "images", "logo-matin-gourmand.png");
  await mailer.transporter.sendMail({
    from: mailer.from,
    to: input.to,
    subject: input.subject,
    text: `${input.heading}\n\n${input.body}\n\n${input.items?.map((item) => `${item.name} × ${item.quantity} · ${currency(item.unitPriceCfa)} l’unité · ${currency(item.subtotalCfa)}`).join("\n") || ""}\n\n${input.rows.map(([label, value]) => `${label} : ${value}`).join("\n")}${input.trackingUrl ? `\n\nSuivre votre commande : ${input.trackingUrl}` : ""}\n\nMatin Gourmand · Préparé avec soin, chaque matin.`,
    attachments: [{ filename: "logo-matin-gourmand.png", path: logoPath, cid: "matin-gourmand-logo" }],
    html: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f4ee;font-family:Arial,Helvetica,sans-serif;color:#26362e"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.body)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4ee"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffdf8;border:1px solid #e4e8df"><tr><td align="center" style="padding:19px 24px;background:#fffdf8;border-bottom:1px solid #e9ede5"><img src="cid:matin-gourmand-logo" width="188" alt="Matin Gourmand" style="display:block;width:188px;max-width:100%;height:auto;border:0"></td></tr><tr><td style="padding:28px 30px 10px"><p style="margin:0 0 9px;color:#67806d;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${input.items ? "Récapitulatif de commande" : "Matin Gourmand"}</p><h1 style="margin:0;color:#203c30;font-family:Georgia,'Times New Roman',serif;font-size:29px;font-weight:500;line-height:1.2">${escapeHtml(input.heading)}</h1><p style="margin:12px 0 0;color:#647066;font-size:13px;line-height:1.75">${escapeHtml(input.body)}</p>${itemTable}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:20px;font-size:12px">${rows}</table>${input.trackingUrl ? `<div style="margin:24px 0 12px;text-align:center"><a href="${escapeHtml(input.trackingUrl)}" style="display:inline-block;padding:13px 22px;background:#264c3e;color:#fffdf8;text-decoration:none;font-size:12px;font-weight:bold">Suivre ma commande</a></div><p style="margin:0 0 12px;color:#849084;font-size:10px;text-align:center">Lien privé, utilisable sans créer de compte.</p>` : ""}</td></tr><tr><td style="padding:17px 30px 23px;background:#f5f6f0;border-top:1px solid #e7ebe3"><p style="margin:0;color:#667368;font-family:Georgia,'Times New Roman',serif;font-size:15px">Merci de faire une place à nos douceurs.</p><p style="margin:6px 0 0;color:#8a948a;font-size:10px;line-height:1.6">Matin Gourmand · Préparé avec soin, chaque matin.<br>Ce message a été envoyé automatiquement, merci de ne pas y répondre.</p></td></tr></table></td></tr></table></body></html>`,
  });
}