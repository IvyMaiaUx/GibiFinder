import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash } from "crypto";
import type { Request } from "express";

// Secret for signing session tokens. Reuses ADMIN_KEY when SESSION_SECRET isn't
// set (both should be strong env values in production).
const SESSION_SECRET = (process.env["SESSION_SECRET"] || process.env["ADMIN_KEY"] || "gibi-session-secret-change-me").trim();

// ---- Passwords (scrypt, salted) with transparent legacy (unsalted SHA-256) support ----

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function isLegacyHash(stored: string): boolean {
  return typeof stored === "string" && !stored.startsWith("scrypt$");
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith("scrypt$")) {
    const [, salt, hash] = stored.split("$");
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const test = scryptSync(password, salt, 64);
    return test.length === expected.length && timingSafeEqual(test, expected);
  }
  // Legacy: unsalted SHA-256 hex (64 chars).
  const legacy = createHash("sha256").update(password).digest("hex");
  return legacy.length === stored.length && timingSafeEqual(Buffer.from(legacy), Buffer.from(stored));
}

// ---- Stateless session tokens: "<userId>.<hmac>" ----

export function signToken(userId: string): string {
  const sig = createHmac("sha256", SESSION_SECRET).update(userId).digest("base64url");
  return `${userId}.${sig}`;
}

export function verifyToken(token?: string | null): string | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", SESSION_SECRET).update(userId).digest("base64url");
  try {
    if (sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return userId;
  } catch { /* length mismatch */ }
  return null;
}

/** The authenticated user id from the request's session token, or null. */
export function sessionUserId(req: Request): string | null {
  const header = req.headers["x-user-token"];
  const token = Array.isArray(header) ? header[0] : header;
  return verifyToken(token);
}
