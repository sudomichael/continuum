type Props = {
  title: string;
  icon: string;
  content?: string | null;
  empty?: string;
};

export function BrainSection({ title, icon, content, empty }: Props) {
  const isEmpty = !content || !content.trim();
  return (
    <section className="bg-surface-container-low border border-outline-variant rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-primary text-[18px]">
          {icon}
        </span>
        <h3 className="label-caps text-on-surface-variant">{title}</h3>
      </div>
      {isEmpty ? (
        <p className="code-sm text-on-surface-variant/40">
          {empty ?? "— no signal yet —"}
        </p>
      ) : (
        <div className="text-on-surface text-[14px] leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </section>
  );
}
