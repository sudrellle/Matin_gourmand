import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";

const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  categoryId: z.string().regex(/^cat-[a-z0-9-]+$/).optional(),
  priceCfa: z.number().int().min(0).max(1_000_000_000).optional(),
  available: z.boolean().optional(),
  quantity: z.number().int().min(0).max(100_000).optional(),
  description: z.string().trim().max(1000).optional(),
  imageId: z.string().regex(/^(photo-[a-zA-Z0-9-]+|file-[a-f0-9-]+\.(?:jpg|png|webp))$/).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const { id } = await context.params;
    if (!/^product-[a-f0-9]{24}$/.test(id) && !/^product-[a-z0-9-]{1,60}$/.test(id)) {
      return Response.json({ error: "Produit introuvable." }, { status: 404 });
    }
    const parsed = await readJson(request, productUpdateSchema);
    if (!parsed.success) return Response.json({ error: "Vérifiez les informations du produit." }, { status: 400 });
    const database = getDatabase();
    if (parsed.data.categoryId) {
      const category = database.prepare("SELECT id FROM categories WHERE id = ? AND visible = 1 AND deleted_at IS NULL")
        .get(parsed.data.categoryId);
      if (!category) return Response.json({ error: "Cette catégorie n’est pas disponible." }, { status: 400 });
    }
    const update = parsed.data;
    const result = database.prepare(`
      UPDATE products SET
        name = COALESCE(?, name), category_id = COALESCE(?, category_id),
        price_cfa = COALESCE(?, price_cfa), available = COALESCE(?, available),
        quantity = CASE WHEN ? = 0 THEN 0 ELSE COALESCE(?, quantity) END,
        description = COALESCE(?, description), image_id = COALESCE(?, image_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(
      update.name ?? null, update.categoryId ?? null, update.priceCfa ?? null,
      update.available === undefined ? null : Number(update.available),
      update.available === undefined ? null : Number(update.available),
      update.quantity ?? null, update.description ?? null, update.imageId ?? null, id,
    );
    if (!result.changes) return Response.json({ error: "Produit introuvable." }, { status: 404 });
    recordAudit("PRODUCT_UPDATED", "product", id, admin.id, admin.role, "success", { fields: Object.keys(update) });
    return Response.json({ message: "Produit modifié avec succès." });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const { id } = await context.params;
    const result = getDatabase().prepare("UPDATE products SET deleted_at = ?, available = 0, quantity = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .run(new Date().toISOString(), id);
    if (!result.changes) return Response.json({ error: "Produit introuvable." }, { status: 404 });
    recordAudit("PRODUCT_DELETED", "product", id, admin.id, admin.role, "success");
    return Response.json({ message: "Produit supprimé avec succès." });
  } catch (error) {
    return errorResponse(error);
  }
}