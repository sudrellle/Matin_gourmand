import { randomBytes } from "node:crypto";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({
  title: z.string().trim().min(3).max(100),
  summary: z.string().trim().min(5).max(180),
  description: z.string().trim().min(5).max(2000),
  imageId: z.string().regex(/^photo-[a-zA-Z0-9-]+$/),
  location: z.string().trim().max(120).default("Matin Gourmand"),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  published: z.boolean().default(false),
}).strict().refine((event) => new Date(event.endsAt) > new Date(event.startsAt));

export async function GET() {
  try {
    await requireAdmin();
    const events = getDatabase().prepare(`
      SELECT id, title, summary, description, image_id AS imageId,
        location, starts_at AS startsAt, ends_at AS endsAt,
        published, published_at AS publishedAt, created_at AS createdAt
      FROM events WHERE deleted_at IS NULL ORDER BY starts_at DESC
    `).all();
    return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const parsed = await readJson(request, eventSchema);
    if (!parsed.success) return Response.json({ error: "Vérifiez le titre, le contenu et les dates de l’événement." }, { status: 400 });
    const event = parsed.data;
    const id = `event-${randomBytes(12).toString("hex")}`;
    getDatabase().prepare(`
      INSERT INTO events (id, title, summary, description, image_id, location,
        starts_at, ends_at, published, created_by, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, event.title, event.summary, event.description, event.imageId, event.location,
      event.startsAt, event.endsAt, Number(event.published), admin.id,
      event.published ? new Date().toISOString() : null);
    recordAudit(event.published ? "EVENT_PUBLISHED" : "EVENT_CREATED", "event", id, admin.id, admin.role, "success");
    return Response.json({ id, message: event.published ? "Événement publié sur la boutique." : "Événement enregistré en brouillon." }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}