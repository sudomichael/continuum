type State = "active" | "near_launch" | "paused" | "exploring" | "archived";

const PIP_STYLES: Record<State, { label: string; cls: string }> = {
  active: {
    label: "ACTIVE",
    cls: "border-secondary text-secondary bg-secondary/10",
  },
  near_launch: {
    label: "NEAR LAUNCH",
    cls: "border-tertiary text-tertiary bg-tertiary/10",
  },
  paused: {
    label: "PAUSED",
    cls: "border-outline text-on-surface-variant bg-surface-variant",
  },
  exploring: {
    label: "EXPLORING",
    cls: "border-primary-container text-primary-container bg-primary-container/10",
  },
  archived: {
    label: "ARCHIVED",
    cls: "border-outline-variant text-on-surface-variant bg-surface-container",
  },
};

export function StatusPip({ state }: { state: string }) {
  const cfg = PIP_STYLES[(state as State) in PIP_STYLES ? (state as State) : "active"];
  return (
    <span
      className={`label-caps px-[6px] py-[2px] rounded border whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
