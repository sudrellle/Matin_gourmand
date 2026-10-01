import { randomBytes } from "node:crypto";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(200).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#66806d"),
  visible: z.boolean().default(true),
}).strict();

const reorderSchema = z.object({
  order: z.array(z.object({ id: z.string().regex(/^cat-[a-z0-9-]+$/), displayOrder: z.number().int().positive() }).strict()).min(1).max(100),
}).strict().refine(({ order }) => new Set(order.map((item) => item.id)).size === order.length
  && new Set(order.map((item) => item.displayOrder)).size === order.length);

export async function GET() {
  try {
    await requireAdmin();
    const categories = getDatabase().prepare(`
      SELECT c.id, c.name, c.description, c.color, c.visible,
        c.display_order AS displayOrder, COUNT(p.id) AS productCount
      FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.deleted_at IS NULL
      WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.display_order
    `).all();
    return Response.json({ categories }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const parsed = await readJson(request, categorySchema);
    if (!parsed.success) return Response.json({ error: "Vérifiez les informations de la catégorie." }, { status: 400 });
    const database = getDatabase();
    const displayOrder = (database.prepare("SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM categories WHERE deleted_at IS NULL").get() as { next: number }).next;
    const id = `cat-${randomBytes(10).toString("hex")}`;
    try {
      database.prepare(`INSERT INTO categories (id, name, description, color, visible, display_order) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, parsed.data.name, parsed.data.description, parsed.data.color, Number(parsed.data.visible), displayOrder);
    } catch {
      return Response.json({ error: "Une catégorie avec ce nom existe déjà." }, { status: 409 });
    }
    recordAudit("CATEGORY_CREATED", "category", id, admin.id, admin.role, "success");
    return Response.json({ id, message: "Catégorie créée avec succès." }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const parsed = await readJson(request, reorderSchema);
    if (!parsed.success) return Response.json({ error: "Ordre de catégories invalide." }, { status: 400 });
    const database = getDatabase();
    const updateOrder = database.transaction(() => {
      const ids = parsed.data.order.map((item) => item.id);
      const existing = database.prepare(`SELECT id FROM categories WHERE deleted_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`)
        .all(...ids) as Array<{ id: string }>;
      if (existing.length !== ids.length) throw new Error("CATEGORY_NOT_FOUND");
      database.prepare("UPDATE categories SET display_order = display_order + 1000000 WHERE deleted_at IS NULL").run();
      const update = database.prepare("UPDATE categories SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
      for (const item of parsed.data.order) update.run(item.displayOrder, item.id);
    });
    try {
      updateOrder();
    } catch (error) {
      if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") return Response.json({ error: "Une catégorie n’existe plus." }, { status: 409 });
      return Response.json({ error: "Cet ordre est déjà utilisé." }, { status: 409 });
    }
    recordAudit("CATEGORY_REORDERED", "category", null, admin.id, admin.role, "success");
    return Response.json({ message: "Ordre des catégories mis à jour." });
  } catch (error) {
    return errorResponse(error);
  }
}