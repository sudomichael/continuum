export function MomentumBars({ value }: { value: number }) {
  // 4 bars; value 0-100 maps to 0-4 lit bars
  const lit = Math.max(0, Math.min(4, Math.round((value / 100) * 4)));
  const color = lit >= 3 ? "bg-secondary" : lit === 2 ? "bg-primary" : lit === 1 ? "bg-error" : "bg-outline-variant/30";
  return (
    <div className="flex gap-[2px] items-end justify-center">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-1 h-3 ${i < lit ? color : "bg-outline-variant/30"}`}
        />
      ))}
    </div>
  );
}
