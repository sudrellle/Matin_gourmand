import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const events = getDatabase().prepare(`
    SELECT id, title, summary, description, image_id AS imageId,
      location, starts_at AS startsAt, ends_at AS endsAt
    FROM events
    WHERE published = 1 AND deleted_at IS NULL AND ends_at > ?
    ORDER BY starts_at ASC LIMIT 12
  `).all(new Date().toISOString());
  return Response.json({ events }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}