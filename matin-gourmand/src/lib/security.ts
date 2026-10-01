import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/db";

export type AdminRole = "admin" | "manager";
export type AdminSession = { id: string; email: string; role: AdminRole };

const SESSION_COOKIE = "mg_session";
const CSRF_COOKIE = "mg_csrf";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function requiredSecret(name: "SESSION_SECRET" | "OTP_SECRET") {
  const secret = process.env[name];
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
  return secret;
}

export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function secureDigest(value: string) {
  return createHmac("sha256", requiredSecret("SESSION_SECRET")).update(value).digest("hex");
}

export function otpDigest(value: string, challengeId: string) {
  return createHmac("sha256", requiredSecret("OTP_SECRET"))
    .update(`${challengeId}:${value}`)
    .digest("hex");
}

export function newOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function newSecret() {
  return randomBytes(32).toString("base64url");
}

export function sealTrackingToken(value: string) {
  const key = createHash("sha256").update(requiredSecret("SESSION_SECRET")).digest();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [nonce, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function openTrackingToken(value: string) {
  const [nonceValue, tagValue, encryptedValue] = value.split(".");
  if (!nonceValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted tracking token");
  const key = createHash("sha256").update(requiredSecret("SESSION_SECRET")).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonceValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function passwordIsStrong(password: string) {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export function recordAudit(action: string, entity: string, entityId: string | null, actorId: string | null, actorRole: string, result: "success" | "failure", context: Record<string, unknown> = {}) {
  getDatabase()
    .prepare("INSERT INTO audit_logs (id, admin_id, actor_role, action, entity, entity_id, result, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(randomBytes(16).toString("hex"), actorId, actorRole, action, entity, entityId, result, JSON.stringify(context));
}

export function enforceRateLimit(key: string, maxAttempts: number, windowMs: number) {
  const database = getDatabase();
  const keyHash = secureDigest(key);
  const now = Date.now();
  const resetAt = now + windowMs;
  const read = database.prepare("SELECT attempt_count AS count, reset_at AS resetAt FROM rate_limits WHERE key_hash = ?");
  const write = database.prepare(`
    INSERT INTO rate_limits (key_hash, attempt_count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key_hash) DO UPDATE SET
      attempt_count = CASE WHEN reset_at <= ? THEN 1 ELSE attempt_count + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
  `);
  const consume = database.transaction(() => {
        const current = read.get(keyHash) as { count: number; resetAt: number } | undefined;
        write.run(keyHash, resetAt, now, now);
        return current && current.resetAt > now && current.count >= maxAttempts;
  });
  if (consume()) {
    throw new Response(JSON.stringify({ error: "Trop de tentatives. Réessayez plus tard." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(windowMs / 1000)) },
    });
  }
}

export function requestAddress(request: Request) {
  return request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || (process.env.NODE_ENV === "production" ? "" : new URL(request.url).origin);
  if (!origin || origin !== expected) {
    throw new Response(JSON.stringify({ error: "Requête refusée." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDatabase()
    .prepare(`
      SELECT admins.id, admins.email, admins.role
      FROM admin_sessions
      JOIN admins ON admins.id = admin_sessions.admin_id
      WHERE admin_sessions.token_hash = ?
        AND admin_sessions.expires_at > ?
        AND admins.active = 1
        AND admins.locked_at IS NULL
    `)
    .get(secureDigest(token), new Date().toISOString()) as AdminSession | undefined;
  return row || null;
}

export async function requireAdmin(allowedRoles: AdminRole[] = ["admin", "manager"]) {
  const session = await getAdminSession();
  if (!session || !allowedRoles.includes(session.role)) {
    throw new Response(JSON.stringify({ error: "Accès refusé." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

export async function assertCsrf(request: Request) {
  assertSameOrigin(request);
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const csrfCookie = cookieStore.get(CSRF_COOKIE)?.value;
  const csrfHeader = request.headers.get("x-csrf-token");
  if (!token || !csrfCookie || !csrfHeader || !safeEqual(csrfCookie, csrfHeader)) {
    throw new Response(JSON.stringify({ error: "Requête refusée." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const session = getDatabase()
    .prepare("SELECT csrf_hash AS csrfHash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?")
    .get(secureDigest(token), new Date().toISOString()) as { csrfHash: string } | undefined;
  if (!session || !safeEqual(session.csrfHash, secureDigest(csrfHeader))) {
    throw new Response(JSON.stringify({ error: "Requête refusée." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function createAdminSession(adminId: string) {
  const database = getDatabase();
  const token = newSecret();
  const csrfToken = newSecret();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  database.prepare("INSERT INTO admin_sessions (id, admin_id, token_hash, csrf_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomBytes(16).toString("hex"), adminId, secureDigest(token), secureDigest(csrfToken), expiresAt);
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    expires: new Date(expiresAt),
  });
  cookieStore.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) getDatabase().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(secureDigest(token));
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  cookieStore.set(CSRF_COOKIE, "", { sameSite: "strict", path: "/", maxAge: 0 });
}