// Edge-runtime safe HMAC verification for the session cookie.
//
// next/middleware runs on the edge where node:crypto isn't available, so we
// re-implement the verifier with Web Crypto (crypto.subtle). The cookie
// format and TTL must stay in sync with src/lib/auth.ts.

export const SESSION_COOKIE = "continuum_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) {
    s += arr[i].toString(16).padStart(2, "0");
  }
  return s;
}

async function sign(payload: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const keyBuf = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength,
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payloadBytes = new TextEncoder().encode(payload);
  const payloadBuf = payloadBytes.buffer.slice(
    payloadBytes.byteOffset,
    payloadBytes.byteOffset + payloadBytes.byteLength,
  ) as ArrayBuffer;
  const sig = await crypto.subtle.sign("HMAC", key, payloadBuf);
  return bytesToHex(sig);
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySessionTokenEdge(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const iat = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) return false;

  const expected = await sign(iat, keyHex);
  if (!constantTimeEqualHex(sig, expected)) return false;

  const iatNum = Number(iat);
  if (!Number.isFinite(iatNum)) return false;
  const ageSec = Math.floor(Date.now() / 1000) - iatNum;
  return ageSec >= 0 && ageSec <= SESSION_TTL_SECONDS;
}
