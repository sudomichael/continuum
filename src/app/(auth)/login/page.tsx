import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  DEFAULT_ADMIN_PASSWORD,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createSessionToken,
} from "@/lib/auth";
import { getSelfHostWorkspaceId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const workspaceId = await getSelfHostWorkspaceId();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!password) {
    return redirect("/login?error=missing&next=" + encodeURIComponent(next));
  }
  if (!(await checkPassword(workspaceId, password))) {
    return redirect("/login?error=invalid&next=" + encodeURIComponent(next));
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(next.startsWith("/") ? next : "/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const errorLabel =
    error === "invalid"
      ? "Wrong password."
      : error === "missing"
        ? "Password required."
        : null;

  // If the default seeded password is still in use, surface it so first-run
  // users aren't stuck. Once it's changed, this disappears.
  const workspaceId = await getSelfHostWorkspaceId();
  const defaultStillActive = await checkPassword(workspaceId, DEFAULT_ADMIN_PASSWORD);

  return (
    <form action={login} className="space-y-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-wider text-on-background/60">
          Continuum
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-on-background">
          Sign in
        </h1>
      </header>

      <label className="block space-y-2">
        <span className="font-mono text-xs uppercase tracking-wider text-on-background/60">
          Password
        </span>
        <input
          type="password"
          name="password"
          autoFocus
          required
          className="w-full rounded border border-on-background/15 bg-background px-3 py-2 text-on-background focus:border-on-background/40 focus:outline-none"
        />
      </label>

      <input type="hidden" name="next" value={next ?? "/"} />

      {errorLabel && (
        <p className="text-sm text-red-400" role="alert">
          {errorLabel}
        </p>
      )}

      {defaultStillActive && !errorLabel && (
        <p className="rounded border border-on-background/15 px-3 py-2 text-xs text-on-background/70">
          First run — default password is{" "}
          <code className="font-mono text-on-background">continuum</code>.
          Change it in <span className="font-mono">/settings</span> after
          signing in.
        </p>
      )}

      <button
        type="submit"
        className="w-full rounded bg-on-background px-4 py-2 font-mono text-sm uppercase tracking-wider text-background hover:bg-on-background/90"
      >
        Sign in
      </button>
    </form>
  );
}
