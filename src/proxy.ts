// Auth gate for the Continuum web UI + API.
//
// API routes accept either a valid session cookie OR an X-Continuum-Token
// header. Edge runtime can't reach the DB, so per-device CLI tokens are
// verified inside the route handlers themselves — here we just require the
// header to be present and non-empty (defense-in-depth: stops "completely
// unauthenticated" calls without giving the proxy DB access).
//
// Page routes require a session cookie and redirect to /login otherwise.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionTokenEdge } from "@/lib/auth-edge";

const PUBLIC_PAGE_PATHS = new Set(["/login"]);
// API routes the CLI pairing flow needs before it has a token. The
// `start` and `poll` endpoints are protected only by the random code
// they hand out; `authorize` is protected by the session cookie like
// every other authenticated API.
const PUBLIC_API_PATHS = new Set(["/api/cli-auth/start", "/api/cli-auth/poll"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PAGE_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_API_PATHS.has(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = await verifySessionTokenEdge(cookie);

  if (isApi) {
    if (hasSession) return NextResponse.next();
    // Defer real token verification to the route (it can hit Postgres).
    const got = req.headers.get("x-continuum-token");
    if (got && got.trim().length > 0) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Exclude static assets + next internals. Everything else hits the gate.
  matcher: ["/((?!_next/|favicon|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|map)$).*)"],
};
