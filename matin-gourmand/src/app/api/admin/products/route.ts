import { randomBytes } from "node:crypto";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const productSchema = z.object({
  name: z.string().trim().min(1).max(100),
  categoryId: z.string().regex(/^cat-[a-z0-9-]+$/),
  priceCfa: z.number().int().min(0).max(1_000_000_000),
  available: z.boolean(),
  quantity: z.number().int().min(0).max(100_000),
  description: z.string().trim().max(1000).default(""),
  imageId: z.string().regex(/^(photo-[a-zA-Z0-9-]+|file-[a-f0-9-]+\.(?:jpg|png|webp))$/),
}).strict();

export async function GET() {
  try {
    await requireAdmin();
    const products = getDatabase().prepare(`
      SELECT p.id, p.category_id AS categoryId, c.name AS category, p.name,
        p.description, p.price_cfa AS priceCfa, p.image_id AS imageId,
        p.available, p.quantity, p.featured, p.created_at AS createdAt,
        p.updated_at AS updatedAt
      FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC
    `).all();
    return Response.json({ products }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertCsrf(request);
    await requireAdmin(["admin"]);
    const parsed = await readJson(request, productSchema);
    if (!parsed.success) return Response.json({ error: "Vérifiez les informations du produit." }, { status: 400 });
    const database = getDatabase();
    const category = database.prepare("SELECT id FROM categories WHERE id = ? AND visible = 1 AND deleted_at IS NULL")
      .get(parsed.data.categoryId);
    if (!category) return Response.json({ error: "Cette catégorie n’est pas disponible." }, { status: 400 });
    const id = `product-${randomBytes(12).toString("hex")}`;
    try {
      database.prepare(`
        INSERT INTO products (id, category_id, name, description, price_cfa, image_id, available, quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, parsed.data.categoryId, parsed.data.name, parsed.data.description, parsed.data.priceCfa,
        parsed.data.imageId, parsed.data.available ? 1 : 0, parsed.data.available ? parsed.data.quantity : 0);
    } catch {
      return Response.json({ error: "Un produit de ce nom existe déjà dans cette catégorie." }, { status: 409 });
    }
    recordAudit("PRODUCT_CREATED", "product", id, (await requireAdmin()).id, "admin", "success");
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}