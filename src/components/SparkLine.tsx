"use client";

interface SparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  strokeWidth?: number;
  className?: string;
}

export function SparkLine({
  data,
  width = 120,
  height = 32,
  color = "#DDCBA4",
  fillColor,
  strokeWidth = 1.5,
  className,
}: SparkLineProps) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} className={className}>
        <line
          x1={0} y1={height / 2} x2={width} y2={height / 2}
          stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 2"
        />
      </svg>
    );
  }

  const padding = 2;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * w;
    const y = padding + h - ((val - min) / range) * h;
    return `${x},${y}`;
  });

  const pathD = `M${points.join(" L")}`;
  const areaD = `${pathD} L${padding + w},${padding + h} L${padding},${padding + h} Z`;

  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg width={width} height={height} className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColor || color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={fillColor || color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      {data.length > 0 && (
        <circle
          cx={padding + w}
          cy={padding + h - ((data[data.length - 1] - min) / range) * h}
          r={2.5}
          fill={color}
        />
      )}
    </svg>
  );
}
