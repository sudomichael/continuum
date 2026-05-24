type Props = {
  value: number; // 0-100
  className?: string;
};

export function HealthRing({ value, className = "" }: Props) {
  const v = Math.max(0, Math.min(100, value));
  const color =
    v >= 75 ? "#4edea3" : v >= 50 ? "#adc6ff" : v >= 30 ? "#ffb95f" : "#ffb4ab";
  return (
    <div className={`relative w-8 h-8 ${className}`}>
      <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="#2d3449"
          strokeWidth="3"
        />
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke={color}
          strokeDasharray={`${v}, 100`}
          strokeWidth="3"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-mono font-medium text-[8px]"
        style={{ color }}
      >
        {v}%
      </span>
    </div>
  );
}
