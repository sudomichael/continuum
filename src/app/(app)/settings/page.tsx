import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { PROVIDERS } from "@/lib/providers";
import { prisma } from "@/lib/db";
import { SettingsForm } from "./settings-form";
import { CliDevicesList } from "./cli-devices-list";
import {
  DEFAULT_ADMIN_PASSWORD,
  checkPassword,
  writePassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

async function changePassword(formData: FormData) {
  "use server";
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!(await checkPassword(current))) {
    return redirect("/settings?pwError=current");
  }
  if (next.length < 8) {
    return redirect("/settings?pwError=short");
  }
  if (next !== confirm) {
    return redirect("/settings?pwError=mismatch");
  }
  await writePassword(next);
  redirect("/settings?pwOk=1");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ pwError?: string; pwOk?: string }>;
}) {
  const s = await getSettings();
  const cliDevices = await prisma.cliToken.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      platform: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });
  const { pwError, pwOk } = await searchParams;
  const usingDefault = await checkPassword(DEFAULT_ADMIN_PASSWORD);
  const pwMessage =
    pwError === "current"
      ? { tone: "error" as const, text: "Current password is wrong." }
      : pwError === "short"
        ? { tone: "error" as const, text: "New password must be at least 8 characters." }
        : pwError === "mismatch"
          ? { tone: "error" as const, text: "New passwords didn't match." }
          : pwOk
            ? { tone: "ok" as const, text: "Password updated." }
            : null;
  const presets = Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    baseUrl: p.baseUrl,
    defaultSmartModel: p.defaultSmartModel,
    defaultCheapModel: p.defaultCheapModel,
    requiresKey: p.requiresKey,
    notes: p.notes,
  }));
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-[32px] leading-[40px] tracking-[-0.02em] text-on-surface">
          Settings
        </h1>
        <p className="code-md text-on-surface-variant/70 mt-1">
          Configure the AI provider for each tier. API keys are encrypted at
          rest with <span className="font-mono">AES-256-GCM</span>.
        </p>
      </div>
      <SettingsForm
        presets={presets}
        initial={{
          smart: {
            provider: s.smart.provider,
            baseUrl: s.smart.baseUrl,
            model: s.smart.model,
            keyConfigured: Boolean(s.smart.apiKey),
          },
          cheap: {
            provider: s.cheap.provider,
            baseUrl: s.cheap.baseUrl,
            model: s.cheap.model,
            keyConfigured: Boolean(s.cheap.apiKey),
          },
        }}
      />
      <section className="border border-outline-variant rounded-lg bg-surface-container-low p-4">
        <h2 className="label-caps text-primary mb-2">PASSWORD</h2>
        {usingDefault && (
          <p className="text-[13px] text-tertiary mb-2">
            You&apos;re using the default password. Change it now.
          </p>
        )}
        <form action={changePassword} className="space-y-2 max-w-md">
          <label className="block space-y-2">
            <span className="font-mono text-xs uppercase tracking-wider text-on-surface-variant/70">
              Current
            </span>
            <input
              type="password"
              name="current"
              required
              autoComplete="current-password"
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block space-y-2">
            <span className="font-mono text-xs uppercase tracking-wider text-on-surface-variant/70">
              New
            </span>
            <input
              type="password"
              name="next"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block space-y-2">
            <span className="font-mono text-xs uppercase tracking-wider text-on-surface-variant/70">
              Confirm
            </span>
            <input
              type="password"
              name="confirm"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            />
          </label>
          {pwMessage && (
            <p
              className={`text-[13px] ${pwMessage.tone === "error" ? "text-red-400" : "text-secondary"}`}
              role={pwMessage.tone === "error" ? "alert" : undefined}
            >
              {pwMessage.text}
            </p>
          )}
          <button
            type="submit"
            className="bg-primary text-on-primary label-caps py-2 px-4 rounded hover:opacity-90"
          >
            Update password
          </button>
        </form>
      </section>

      <section className="border border-outline-variant rounded-lg bg-surface-container-low p-4">
        <h2 className="label-caps text-primary mb-2">CONNECTED_DEVICES</h2>
        <p className="text-[13px] text-on-surface-variant mb-4">
          Machines that have paired with this Continuum via{" "}
          <span className="font-mono">continuum connect</span>. Each gets a
          revocable token. Run{" "}
          <span className="font-mono">continuum connect</span> on a new
          machine to add it; revoke from here to kill it.
        </p>
        <CliDevicesList devices={cliDevices} />
        <div className="mt-4 rounded border border-outline-variant bg-surface-container-lowest p-2">
          <div className="label-caps text-on-surface-variant mb-1">
            INSTALL ON A NEW MACHINE
          </div>
          <pre className="font-mono text-[12px] overflow-x-auto whitespace-pre">
{`curl -fsSL https://get.getcontinuum.dev/install.sh | sh
continuum connect`}
          </pre>
        </div>
      </section>
    </div>
  );
}
