// Single-user auth for Continuum.
//
// Two parallel mechanisms:
//   1. Web UI: signed httpOnly cookie set on /login. Proxy checks it.
//   2. Hooks/MCP: X-Continuum-Token header (shared secret). Bypasses cookie.
//
// Password is scrypt-hashed and stored in the Settings singleton row. On a
// fresh install (no hash yet) the bootstrap seeds DEFAULT_ADMIN_PASSWORD —
// log in with that and change it in /settings. Self-hosters who don't want
// the default credentials can pre-seed CONTINUUM_PASSWORD_HASH in env (the
// in-DB hash takes precedence when present).

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { prisma } from "./db";

const COOKIE_NAME = "continuum_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE = COOKIE_NAME;

function getSigningKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-char hex string (32 bytes). " +
        "Generate with: openssl rand -hex 32",
    );
  }
  return Buffer.from(hex, "hex");
}

// ---- Password hashing -------------------------------------------------------

const SCRYPT_N = 2 ** 15; // ~64 MB, ~100ms on a modern laptop
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
// Node's scrypt default maxmem (32 MB) is smaller than N=2^15 * r=8 * 128 bytes
// requires (~128 MB). Lift the cap explicitly; if we ever change N/r, this
// stays correct because we derive it from the params.
function scryptMaxmem(N: number, r: number): number {
  return 256 * N * r;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: scryptMaxmem(SCRYPT_N, SCRYPT_R),
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, derivedB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(derivedB64, "base64");
  const got = scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: scryptMaxmem(N, r),
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// ---- Stored hash lookup -----------------------------------------------------
//
// All four helpers now take a `workspaceId`. In self-host mode the caller
// resolves that via getSelfHostWorkspaceId(); in cloud mode this whole
// password code path is dead (Clerk handles auth).

async function readStoredHash(workspaceId: string): Promise<string | null> {
  const envHash = process.env.CONTINUUM_PASSWORD_HASH?.trim();
  const row = await prisma.settings.findUnique({
    where: { workspaceId },
    select: { passwordHash: true },
  });
  return row?.passwordHash || envHash || null;
}

export async function isPasswordSet(workspaceId: string): Promise<boolean> {
  return Boolean(await readStoredHash(workspaceId));
}

export async function writePassword(
  workspaceId: string,
  password: string,
): Promise<void> {
  const hash = hashPassword(password);
  await prisma.settings.upsert({
    where: { workspaceId },
    update: { passwordHash: hash },
    create: { workspaceId, passwordHash: hash },
  });
}

export async function checkPassword(
  workspaceId: string,
  password: string,
): Promise<boolean> {
  const stored = await readStoredHash(workspaceId);
  if (!stored) return false;
  return verifyPassword(password, stored);
}

// ---- Session cookie ---------------------------------------------------------
//
// Cookie value: `<issuedAtSeconds>.<sigHex>`. The signature is an HMAC over
// `<issuedAtSeconds>` using ENCRYPTION_KEY. No user id (single-user app).

function sign(payload: string): string {
  return createHmac("sha256", getSigningKey()).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const iat = Math.floor(Date.now() / 1000);
  return `${iat}.${sign(String(iat))}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const iat = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = sign(iat);
  if (
    sig.length !== expectedSig.length ||
    !timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))
  ) {
    return false;
  }
  const iatNum = Number(iat);
  if (!Number.isFinite(iatNum)) return false;
  const ageSec = Math.floor(Date.now() / 1000) - iatNum;
  return ageSec >= 0 && ageSec <= SESSION_TTL_SECONDS;
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

// ---- First-run seed ---------------------------------------------------------

export const DEFAULT_ADMIN_PASSWORD = "continuum";

export async function seedDefaultPasswordIfMissing(
  workspaceId: string,
): Promise<boolean> {
  if (await isPasswordSet(workspaceId)) return false;
  await writePassword(workspaceId, DEFAULT_ADMIN_PASSWORD);
  return true;
}
