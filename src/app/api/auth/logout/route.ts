import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login", baseUrl()), { status: 303 });
}

function baseUrl() {
  return process.env.CONTINUUM_URL || "http://localhost:3000";
}
