// Phase 14 §18: every list page hand-rolled its own `<h1> + action button` row —
// this is the shared version, styled identically to what every page already used.
export default function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}
