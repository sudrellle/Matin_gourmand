import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

const deliveryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  feeCfa: z.number().int().min(0).max(1_000_000).optional(),
  minimumHours: z.number().int().min(0).max(720).optional(),
  maximumHours: z.number().int().min(1).max(720).optional(),
  neighborhoods: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  instructions: z.string().trim().max(300).optional(),
  availability: z.record(z.string(), z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/)).max(4)).optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: Context) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const { id } = await context.params;
    const parsed = await readJson(request, deliveryUpdateSchema);
    if (!parsed.success) return Response.json({ error: "Vérifiez les informations de livraison." }, { status: 400 });
    const database = getDatabase();
    const current = database.prepare("SELECT * FROM delivery_zones WHERE id = ? AND deleted_at IS NULL").get(id) as { kind: string } | undefined;
    if (!current) return Response.json({ error: "Zone introuvable." }, { status: 404 });
    const input = parsed.data;
    const minimum = input.minimumHours;
    const maximum = input.maximumHours;
    if (minimum !== undefined && maximum !== undefined && minimum >= maximum) {
      return Response.json({ error: "Le délai minimum doit être inférieur au délai maximum." }, { status: 400 });
    }
    if (input.active === false) {
      const remaining = database.prepare("SELECT COUNT(*) AS count FROM delivery_zones WHERE kind = ? AND id <> ? AND active = 1 AND deleted_at IS NULL")
        .get(current.kind, id) as { count: number };
      if (!remaining.count) return Response.json({ error: "Gardez au moins un mode de livraison actif." }, { status: 409 });
    }
    if (input.neighborhoods && current.kind === "delivery") {
      const existing = database.prepare("SELECT neighborhoods FROM delivery_zones WHERE kind = 'delivery' AND id <> ? AND active = 1 AND deleted_at IS NULL").all(id) as Array<{ neighborhoods: string }>;
      const used = new Set(existing.flatMap((zone) => JSON.parse(zone.neighborhoods) as string[]).map((name) => name.toLocaleLowerCase("fr")));
      if (input.neighborhoods.some((name) => used.has(name.toLocaleLowerCase("fr")))) {
        return Response.json({ error: "Un quartier ne peut appartenir qu’à une seule zone." }, { status: 409 });
      }
    }
    const result = database.prepare(`
      UPDATE delivery_zones SET name = COALESCE(?, name), fee_cfa = COALESCE(?, fee_cfa),
        minimum_hours = COALESCE(?, minimum_hours), maximum_hours = COALESCE(?, maximum_hours),
        neighborhoods = COALESCE(?, neighborhoods), instructions = COALESCE(?, instructions),
        availability = COALESCE(?, availability), active = COALESCE(?, active),
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `).run(input.name ?? null, input.feeCfa ?? null, minimum ?? null, maximum ?? null,
      input.neighborhoods ? JSON.stringify(input.neighborhoods) : null, input.instructions ?? null,
      input.availability ? JSON.stringify(input.availability) : null,
      input.active === undefined ? null : Number(input.active), id);
    if (result.changes !== 1) return Response.json({ error: "Zone introuvable." }, { status: 404 });
    recordAudit("DELIVERY_UPDATED", "delivery_zone", id, admin.id, admin.role, "success", { fields: Object.keys(input) });
    return Response.json({ message: "Mode de livraison modifié. Les commandes existantes gardent leur tarif." });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const { id } = await context.params;
    const database = getDatabase();
    const zone = database.prepare("SELECT kind FROM delivery_zones WHERE id = ? AND deleted_at IS NULL").get(id) as { kind: string } | undefined;
    if (!zone) return Response.json({ error: "Zone introuvable." }, { status: 404 });
    const used = database.prepare("SELECT COUNT(*) AS count FROM orders WHERE delivery_zone_id = ? AND status NOT IN ('delivered', 'cancelled')").get(id) as { count: number };
    if (used.count) return Response.json({ error: `Cette zone est utilisée par ${used.count} commande(s) en cours. Désactivez-la plutôt.` }, { status: 409 });
    const active = database.prepare("SELECT COUNT(*) AS count FROM delivery_zones WHERE kind = ? AND id <> ? AND active = 1 AND deleted_at IS NULL").get(zone.kind, id) as { count: number };
    if (!active.count) return Response.json({ error: "Gardez au moins un mode de livraison actif." }, { status: 409 });
    database.prepare("UPDATE delivery_zones SET deleted_at = ?, active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(new Date().toISOString(), id);
    recordAudit("DELIVERY_DELETED", "delivery_zone", id, admin.id, admin.role, "success");
    return Response.json({ message: "Mode de livraison supprimé." });
  } catch (error) {
    return errorResponse(error);
  }
}