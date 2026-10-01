import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import {
  assertSameOrigin,
  createAdminSession,
  enforceRateLimit,
  otpDigest,
  recordAudit,
  requestAddress,
  safeEqual,
} from "@/lib/security";

export const runtime = "nodejs";

const verifySchema = z.object({
  challengeId: z.string().regex(/^[a-f0-9]{32}$/),
  code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    enforceRateLimit(`admin-otp:${requestAddress(request)}`, 8, 15 * 60 * 1000);
    const parsed = await readJson(request, verifySchema);
    if (!parsed.success) return Response.json({ error: "Code de connexion invalide ou expiré." }, { status: 400 });

    const database = getDatabase();
    const challenge = database.prepare(`
      SELECT otp_challenges.admin_id AS adminId, otp_challenges.otp_hash AS otpHash,
        otp_challenges.expires_at AS expiresAt, otp_challenges.failed_attempts AS failedAttempts,
        admins.email, admins.role, admins.active, admins.locked_at AS lockedAt
      FROM otp_challenges JOIN admins ON admins.id = otp_challenges.admin_id
      WHERE otp_challenges.id = ? AND otp_challenges.consumed_at IS NULL
    `).get(parsed.data.challengeId) as {
      adminId: string; otpHash: string; expiresAt: string; failedAttempts: number;
      email: string; role: string; active: number; lockedAt: string | null;
    } | undefined;

    const now = new Date().toISOString();
    if (!challenge || challenge.expiresAt <= now || challenge.active !== 1 || challenge.lockedAt) {
      return Response.json({ error: "Code de connexion invalide ou expiré." }, { status: 401 });
    }

    if (!safeEqual(otpDigest(parsed.data.code, parsed.data.challengeId), challenge.otpHash)) {
      database.prepare("UPDATE otp_challenges SET failed_attempts = failed_attempts + 1, consumed_at = CASE WHEN failed_attempts + 1 >= 3 THEN ? ELSE consumed_at END WHERE id = ? AND consumed_at IS NULL")
        .run(now, parsed.data.challengeId);
      recordAudit("OTP_FAILED", "admin", challenge.adminId, challenge.adminId, challenge.role, "failure");
      return Response.json({ error: "Code de connexion invalide ou expiré." }, { status: 401 });
    }

    const consumed = database.prepare("UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ?")
      .run(now, parsed.data.challengeId, now);
    if (consumed.changes !== 1) {
      return Response.json({ error: "Code de connexion invalide ou expiré." }, { status: 401 });
    }

    await createAdminSession(challenge.adminId);
    recordAudit("ADMIN_LOGIN_SUCCESS", "admin", challenge.adminId, challenge.adminId, challenge.role, "success");
    return Response.json({ message: "Connexion réussie." });
  } catch (error) {
    return errorResponse(error);
  }
}