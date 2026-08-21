// Deliberately hand-rolled instead of a charting library — Phase 9 asked for "one
// simple sales chart," not a reason to add a new dependency for a single sparkline.
export default function Sparkline({ data }: { data: { date: string; total: number }[] }) {
  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough data yet.</p>;
  }

  const width = 300;
  const height = 60;
  const totals = data.map((d) => d.total);
  const max = Math.max(...totals, 1);
  const min = Math.min(...totals, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data
    .map((d, i) => {
      const x = i * stepX;
      const y = height - ((d.total - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary"
      />
    </svg>
  );
}
