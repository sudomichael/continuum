// Auth gate for the Continuum web UI + API.
//
// Two modes:
//   - Self-host (default): session cookie OR X-Continuum-Token header.
//   - Cloud (CONTINUUM_MULTI_TENANT=1): Clerk session OR X-Continuum-Token.
//
// API routes always allow a non-empty X-Continuum-Token through (real token
// verification happens inside the route, which can reach Postgres — proxies
// run on the edge runtime). Page routes require a valid web session.

import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { SESSION_COOKIE, verifySessionTokenEdge } from "@/lib/auth-edge";

const SELF_HOST_PUBLIC_PAGES = new Set(["/login"]);
// API routes the CLI pairing flow needs before it has a token. The `start`
// and `poll` endpoints are protected by the random code they hand out, not
// by a session. `authorize` is session-protected like everything else.
const PUBLIC_API_PATHS = new Set(["/api/cli-auth/start", "/api/cli-auth/poll"]);
// Webhook receives Clerk's signed POSTs — must be reachable without a session.
const CLOUD_WEBHOOK_PATHS = new Set(["/api/clerk-webhook"]);

const isMultiTenant =
  process.env.CONTINUUM_MULTI_TENANT === "1" ||
  process.env.CONTINUUM_MULTI_TENANT === "true";

// Cloud-mode proxy is Clerk-driven. We let Clerk auth-check page requests
// and defer API token validation to the route itself (same pattern as
// self-host).
const isCloudPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/cli-auth/start",
  "/api/cli-auth/poll",
  "/api/clerk-webhook",
]);

const cloudProxy = clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;
  if (isCloudPublic(req)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    const got = req.headers.get("x-continuum-token");
    if (got && got.trim().length > 0) return NextResponse.next();
    // Otherwise require a signed-in user (Clerk session).
    await auth.protect();
    return NextResponse.next();
  }

  // Pages: require Clerk session.
  await auth.protect();
  return NextResponse.next();
});

async function selfHostProxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (SELF_HOST_PUBLIC_PAGES.has(pathname)) return NextResponse.next();
  if (PUBLIC_API_PATHS.has(pathname)) return NextResponse.next();
  if (CLOUD_WEBHOOK_PATHS.has(pathname)) {
    // No webhook in self-host; 404 to make it obvious.
    return new NextResponse("Not found", { status: 404 });
  }

  const isApi = pathname.startsWith("/api/");
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = await verifySessionTokenEdge(cookie);

  if (isApi) {
    if (hasSession) return NextResponse.next();
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

export const proxy = isMultiTenant ? cloudProxy : selfHostProxy;

export const config = {
  // Exclude static assets + next internals. Everything else hits the gate.
  matcher: ["/((?!_next/|favicon|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|map)$).*)"],
};
