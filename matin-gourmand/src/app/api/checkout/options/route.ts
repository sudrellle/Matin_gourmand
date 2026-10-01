import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const zones = getDatabase().prepare(`
    SELECT id, name, fee_cfa AS feeCfa, minimum_hours AS minimumHours,
      maximum_hours AS maximumHours, neighborhoods, kind, instructions
    FROM delivery_zones WHERE active = 1 AND deleted_at IS NULL ORDER BY kind, fee_cfa
  `).all();
  return Response.json({ zones }, { headers: { "Cache-Control": "no-store" } });
}