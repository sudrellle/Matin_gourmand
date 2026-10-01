import { randomBytes } from "node:crypto";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { assertCsrf, recordAudit, requireAdmin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scheduleSchema = z.record(z.string(), z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/)).max(4)).default({});
const deliverySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["pickup", "delivery"]),
  feeCfa: z.number().int().min(0).max(1_000_000),
  minimumHours: z.number().int().min(0).max(720),
  maximumHours: z.number().int().min(1).max(720),
  neighborhoods: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  instructions: z.string().trim().max(300).default(""),
  availability: scheduleSchema,
}).strict().refine((value) => value.minimumHours < value.maximumHours);

export async function GET() {
  try {
    await requireAdmin();
    const zones = getDatabase().prepare(`
      SELECT id, name, kind, fee_cfa AS feeCfa, minimum_hours AS minimumHours,
        maximum_hours AS maximumHours, neighborhoods, availability, instructions, active
      FROM delivery_zones WHERE deleted_at IS NULL ORDER BY kind, name
    `).all();
    return Response.json({ zones }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertCsrf(request);
    const admin = await requireAdmin(["admin"]);
    const parsed = await readJson(request, deliverySchema);
    if (!parsed.success) return Response.json({ error: "Le tarif et les délais doivent être valides." }, { status: 400 });
    const input = parsed.data;
    const database = getDatabase();
    const active = database.prepare("SELECT COUNT(*) AS count FROM delivery_zones WHERE kind = ? AND active = 1 AND deleted_at IS NULL").get(input.kind) as { count: number };
    if (!active.count) return Response.json({ error: "Gardez au moins un mode actif avant d’en ajouter un autre." }, { status: 409 });
    if (input.kind === "delivery") {
      const existing = database.prepare("SELECT neighborhoods FROM delivery_zones WHERE kind = 'delivery' AND active = 1 AND deleted_at IS NULL").all() as Array<{ neighborhoods: string }>;
      const used = new Set(existing.flatMap((zone) => JSON.parse(zone.neighborhoods) as string[]).map((name) => name.toLocaleLowerCase("fr")));
      if (input.neighborhoods.some((name) => used.has(name.toLocaleLowerCase("fr")))) {
        return Response.json({ error: "Un quartier ne peut appartenir qu’à une seule zone." }, { status: 409 });
      }
    }
    const id = `zone-${randomBytes(10).toString("hex")}`;
    database.prepare(`
      INSERT INTO delivery_zones (id, name, fee_cfa, minimum_hours, maximum_hours,
        neighborhoods, availability, kind, instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.feeCfa, input.minimumHours, input.maximumHours,
      JSON.stringify(input.neighborhoods), JSON.stringify(input.availability), input.kind, input.instructions);
    recordAudit("DELIVERY_CREATED", "delivery_zone", id, admin.id, admin.role, "success");
    return Response.json({ id, message: "Mode de livraison créé." }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}