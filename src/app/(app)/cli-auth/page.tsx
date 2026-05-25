import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CliAuthForm } from "./cli-auth-form";

export const dynamic = "force-dynamic";

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (!code) return notFound();

  const pairing = await prisma.cliPairing.findUnique({ where: { code } });
  if (!pairing) {
    return (
      <div className="max-w-md mx-auto py-10 space-y-4">
        <h1 className="font-display text-2xl text-on-surface">
          Pairing code not found
        </h1>
        <p className="text-on-surface-variant">
          This code is invalid or already used. Re-run{" "}
          <span className="font-mono">continuum connect</span> on your machine.
        </p>
      </div>
    );
  }

  const expired = pairing.expiresAt < new Date();
  const done = pairing.authorized;

  return (
    <div className="max-w-md mx-auto py-10 space-y-6">
      <header>
        <p className="label-caps text-primary">CONTINUUM · DEVICE PAIRING</p>
        <h1 className="font-display text-[28px] leading-[36px] tracking-[-0.02em] text-on-surface mt-2">
          Authorize a new CLI device?
        </h1>
        <p className="text-on-surface-variant mt-2">
          Your terminal is asking permission to install Continuum hooks on
          this machine. Confirm only if you started this from your own
          terminal.
        </p>
      </header>

      <dl className="rounded-lg border border-outline-variant bg-surface-container-low divide-y divide-outline-variant/40">
        <div className="flex justify-between px-4 py-2">
          <dt className="label-caps text-on-surface-variant">PLATFORM</dt>
          <dd className="font-mono text-sm text-on-surface">
            {pairing.platform ?? "unknown"}
          </dd>
        </div>
        <div className="flex justify-between px-4 py-2">
          <dt className="label-caps text-on-surface-variant">CODE</dt>
          <dd className="font-mono text-sm text-on-surface">
            {pairing.code.slice(0, 8)}…
          </dd>
        </div>
      </dl>

      {expired ? (
        <p className="text-red-400 text-sm">
          This pairing request expired. Re-run{" "}
          <span className="font-mono">continuum connect</span>.
        </p>
      ) : done ? (
        <p className="text-secondary text-sm">
          Authorized. You can close this tab — your CLI has the token.
        </p>
      ) : (
        <CliAuthForm code={pairing.code} defaultName={pairing.platform} />
      )}
    </div>
  );
}
