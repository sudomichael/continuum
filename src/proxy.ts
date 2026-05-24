// Auth gate for the Continuum web UI + API.
//
// API routes accept EITHER a valid session cookie OR a matching
// X-Continuum-Token header. Page routes require a session cookie and
// redirect to /login otherwise.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionTokenEdge } from "@/lib/auth-edge";

const PUBLIC_PAGE_PATHS = new Set(["/login"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static + Next internals are excluded by the matcher below; this is the
  // explicit page allowlist.
  if (PUBLIC_PAGE_PATHS.has(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = await verifySessionTokenEdge(cookie);

  if (isApi) {
    if (hasSession) return NextResponse.next();
    const expectedToken = process.env.CONTINUUM_TOKEN;
    const got = req.headers.get("x-continuum-token");
    if (expectedToken && got === expectedToken) return NextResponse.next();
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
