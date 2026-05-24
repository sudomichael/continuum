import Link from "next/link";
import { Icon } from "./icon";

type Step = {
  done: boolean;
  title: string;
  description: string;
  cta?: { label: string; href: string };
  code?: string;
};

export function OnboardingGate({ steps }: { steps: Step[] }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <p className="label-caps text-primary">CONTINUUM · SETUP</p>
          <h1 className="font-display text-[32px] leading-[40px] tracking-[-0.02em] text-on-surface mt-2">
            Two quick steps to start using your project brain.
          </h1>
          <p className="text-on-surface-variant mt-2">
            We&apos;ll keep this here until everything&apos;s wired up. Each
            step takes ~30 seconds.
          </p>
        </div>

        <ol className="space-y-4">
          {steps.map((step, i) => (
            <li
              key={i}
              className={`rounded-lg border p-6 ${
                step.done
                  ? "border-secondary/40 bg-secondary/5"
                  : "border-outline-variant bg-surface-container-low"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    step.done
                      ? "bg-secondary text-on-secondary"
                      : "bg-surface-container-highest text-on-surface-variant"
                  }`}
                >
                  {step.done ? (
                    <Icon name="check" className="text-[18px]" />
                  ) : (
                    <span className="font-mono text-sm font-bold">{i + 1}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-lg text-on-surface">
                    {step.title}
                  </h2>
                  <p className="text-on-surface-variant text-sm mt-1">
                    {step.description}
                  </p>

                  {step.code && (
                    <pre className="mt-3 bg-surface-container-lowest border border-outline-variant rounded p-2 font-mono text-[12px] overflow-x-auto whitespace-pre">
                      {step.code}
                    </pre>
                  )}

                  {step.cta && !step.done && (
                    <Link
                      href={step.cta.href}
                      className="inline-flex items-center gap-2 mt-4 bg-primary text-on-primary label-caps py-2 px-4 rounded hover:opacity-90"
                    >
                      {step.cta.label}
                      <Icon name="arrow_forward" className="text-[16px]" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-center text-xs text-on-surface-variant/60">
          Already set up?{" "}
          <Link href="/?skip-onboarding=1" className="underline">
            Skip to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
