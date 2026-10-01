import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

const eventUpdateSchema = z.object({
  title: z.string().trim().min(3).max(100).optional(),
  summary: z.string().trim().min(5).max(180).optional(),
  description: z.string().trim().min(5).max(2000).optional(),
  imageId: z.string().regex(/^photo-[a-zA-Z0-9-]+$/).optional(),
  location: z.string().trim().max(120).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  published: z.boolean().optional(),
}).strict().refine((event) => Object.keys(event).length > 0);

export async function PATCH(request: Request, context: Context) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const { id } = await context.params;
    const parsed = await readJson(request, eventUpdateSchema);
    if (!parsed.success) return Response.json({ error: "Vérifiez les champs et les dates de l’événement." }, { status: 400 });
    const database = getDatabase();
    const current = database.prepare("SELECT starts_at AS startsAt, ends_at AS endsAt, published FROM events WHERE id = ? AND deleted_at IS NULL")
      .get(id) as { startsAt: string; endsAt: string; published: number } | undefined;
    if (!current) return Response.json({ error: "Événement introuvable." }, { status: 404 });
    const startsAt = parsed.data.startsAt || current.startsAt;
    const endsAt = parsed.data.endsAt || current.endsAt;
    if (new Date(endsAt) <= new Date(startsAt)) return Response.json({ error: "La fin doit être postérieure au début." }, { status: 400 });
    const publishedAt = parsed.data.published === undefined ? null : parsed.data.published ? new Date().toISOString() : null;
    database.prepare(`
      UPDATE events SET title = COALESCE(?, title), summary = COALESCE(?, summary),
        description = COALESCE(?, description), image_id = COALESCE(?, image_id),
        location = COALESCE(?, location), starts_at = ?, ends_at = ?,
        published = COALESCE(?, published), published_at = CASE WHEN ? IS NULL THEN published_at ELSE ? END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(parsed.data.title ?? null, parsed.data.summary ?? null, parsed.data.description ?? null,
      parsed.data.imageId ?? null, parsed.data.location ?? null, startsAt, endsAt,
      parsed.data.published === undefined ? null : Number(parsed.data.published),
      parsed.data.published === undefined ? null : 1, publishedAt, id);
    const action = parsed.data.published === true ? "EVENT_PUBLISHED" : parsed.data.published === false ? "EVENT_UNPUBLISHED" : "EVENT_UPDATED";
    recordAudit(action, "event", id, admin.id, admin.role, "success", { fields: Object.keys(parsed.data) });
    return Response.json({ message: parsed.data.published === true ? "Événement publié." : parsed.data.published === false ? "Événement retiré de la boutique." : "Événement modifié." });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const { id } = await context.params;
    const result = getDatabase().prepare("UPDATE events SET deleted_at = ?, published = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .run(new Date().toISOString(), id);
    if (!result.changes) return Response.json({ error: "Événement introuvable." }, { status: 404 });
    recordAudit("EVENT_DELETED", "event", id, admin.id, admin.role, "success");
    return Response.json({ message: "Événement supprimé." });
  } catch (error) {
    return errorResponse(error);
  }
}