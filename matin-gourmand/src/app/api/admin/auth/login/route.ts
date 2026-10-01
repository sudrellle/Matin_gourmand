import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { getDatabase } from "@/lib/db";
import { sendAdminOtp } from "@/lib/mailer";
import {
  assertSameOrigin,
  enforceRateLimit,
  newOtp,
  otpDigest,
  recordAudit,
  requestAddress,
} from "@/lib/security";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    enforceRateLimit(`admin-login:${requestAddress(request)}`, 8, 15 * 60 * 1000);
    const parsed = await readJson(request, loginSchema);
    if (!parsed.success) return Response.json({ error: "Email ou mot de passe incorrect." }, { status: 400 });

    const email = parsed.data.email.toLowerCase();
    const database = getDatabase();
    const admin = database.prepare(
      "SELECT id, email, password_hash AS passwordHash, role, failed_attempts AS failedAttempts, locked_at AS lockedAt FROM admins WHERE email = ?",
    ).get(email) as { id: string; email: string; passwordHash: string; role: string; failedAttempts: number; lockedAt: string | null } | undefined;

    if (!admin || admin.lockedAt) {
      await bcrypt.compare(parsed.data.password, await bcrypt.hash("nonexistent-account", 12));
      recordAudit("ADMIN_LOGIN_FAILED", "admin", admin?.id || null, admin?.id || null, "unknown", "failure");
      return Response.json({ error: "Email ou mot de passe incorrect." }, { status: 401 });
    }

    const validPassword = await bcrypt.compare(parsed.data.password, admin.passwordHash);
    if (!validPassword) {
      const locked = database.transaction(() => {
        const failedAttempts = admin.failedAttempts + 1;
        database.prepare("UPDATE admins SET failed_attempts = ?, locked_at = CASE WHEN ? >= 3 THEN ? ELSE locked_at END WHERE id = ?")
          .run(failedAttempts, failedAttempts, new Date().toISOString(), admin.id);
        recordAudit(failedAttempts >= 3 ? "ADMIN_ACCOUNT_LOCKED" : "ADMIN_LOGIN_FAILED", "admin", admin.id, admin.id, admin.role, "failure");
        return failedAttempts >= 3;
      })();
      return Response.json(
        { error: locked ? "Compte verrouillé. Contactez la personne responsable de la boutique." : "Email ou mot de passe incorrect." },
        { status: 401 },
      );
    }

    database.prepare("UPDATE admins SET failed_attempts = 0 WHERE id = ?").run(admin.id);
    const challengeId = randomBytes(16).toString("hex");
    const code = newOtp();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    database.prepare("INSERT INTO otp_challenges (id, admin_id, otp_hash, expires_at) VALUES (?, ?, ?, ?)")
      .run(challengeId, admin.id, otpDigest(code, challengeId), expiresAt);

    try {
      await sendAdminOtp(admin.email, code);
    } catch {
      database.prepare("DELETE FROM otp_challenges WHERE id = ?").run(challengeId);
      recordAudit("ADMIN_OTP_DELIVERY_FAILED", "admin", admin.id, admin.id, admin.role, "failure");
      return Response.json({ error: "Le code de connexion n’a pas pu être envoyé. Réessayez plus tard." }, { status: 503 });
    }

    recordAudit("ADMIN_OTP_SENT", "admin", admin.id, admin.id, admin.role, "success");
    return Response.json({ challengeId, message: "Un code de connexion a été envoyé à votre adresse email." }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}