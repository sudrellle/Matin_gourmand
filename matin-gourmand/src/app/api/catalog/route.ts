import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = getDatabase();
  const categories = database
    .prepare(
      "SELECT id, name, description, color, display_order AS displayOrder FROM categories WHERE visible = 1 AND deleted_at IS NULL ORDER BY display_order",
    )
    .all();
  const products = database
    .prepare(
      `SELECT p.id, p.category_id AS categoryId, c.name AS category, p.name,
        p.description, p.price_cfa AS priceCfa, p.image_id AS imageId,
        p.available, p.quantity, p.featured
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.deleted_at IS NULL AND c.visible = 1 AND c.deleted_at IS NULL
       ORDER BY p.featured DESC, c.display_order, p.name`,
    )
    .all();

  return Response.json(
    { categories, products },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}