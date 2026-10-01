import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(200).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  visible: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: Context) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const { id } = await context.params;
    const parsed = await readJson(request, categoryUpdateSchema);
    if (!parsed.success) return Response.json({ error: "Vérifiez les informations de la catégorie." }, { status: 400 });
    const database = getDatabase();
    if (parsed.data.name) {
      const collision = database.prepare("SELECT id FROM categories WHERE name = ? COLLATE BINARY AND id <> ? AND deleted_at IS NULL")
        .get(parsed.data.name, id);
      if (collision) return Response.json({ error: "Une catégorie avec ce nom existe déjà." }, { status: 409 });
    }
    const result = database.prepare(`
      UPDATE categories SET name = COALESCE(?, name), description = COALESCE(?, description),
        color = COALESCE(?, color), visible = COALESCE(?, visible), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(parsed.data.name ?? null, parsed.data.description ?? null, parsed.data.color ?? null,
      parsed.data.visible === undefined ? null : Number(parsed.data.visible), id);
    if (!result.changes) return Response.json({ error: "Catégorie introuvable." }, { status: 404 });
    recordAudit("CATEGORY_UPDATED", "category", id, admin.id, admin.role, "success", { fields: Object.keys(parsed.data) });
    return Response.json({ message: "Catégorie modifiée avec succès." });
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
    const count = database.prepare("SELECT COUNT(*) AS count FROM products WHERE category_id = ? AND deleted_at IS NULL").get(id) as { count: number };
    if (count.count) return Response.json({ error: `Cette catégorie contient ${count.count} produit(s). Réaffectez-les avant de la supprimer.` }, { status: 409 });
    const activeCount = database.prepare("SELECT COUNT(*) AS count FROM categories WHERE visible = 1 AND deleted_at IS NULL").get() as { count: number };
    const isVisible = database.prepare("SELECT visible FROM categories WHERE id = ? AND deleted_at IS NULL").get(id) as { visible: number } | undefined;
    if (isVisible?.visible && activeCount.count <= 1) return Response.json({ error: "Gardez au moins une catégorie visible." }, { status: 409 });
    const result = database.prepare("UPDATE categories SET deleted_at = ?, visible = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .run(new Date().toISOString(), id);
    if (!result.changes) return Response.json({ error: "Catégorie introuvable." }, { status: 404 });
    recordAudit("CATEGORY_DELETED", "category", id, admin.id, admin.role, "success");
    return Response.json({ message: "Catégorie supprimée avec succès." });
  } catch (error) {
    return errorResponse(error);
  }
}