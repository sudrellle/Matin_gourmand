import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

async function main() {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }
  if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters with upper/lowercase, a number, and a symbol.");
  }

  const databasePath = process.env.DATABASE_PATH || join(process.cwd(), "data", "matin-gourmand.db");
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  try {
    database.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_at TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
    const existing = database.prepare("SELECT id FROM admins WHERE email = ?").get(email);
    if (existing) throw new Error("This administrator already exists. No password was changed.");

    database.prepare("INSERT INTO admins (id, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .run(randomBytes(16).toString("hex"), email, await bcrypt.hash(password, 12));
    console.info("Administrator created. Remove ADMIN_PASSWORD from the process environment.");
  } finally {
    database.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Admin account creation failed.");
  process.exitCode = 1;
});