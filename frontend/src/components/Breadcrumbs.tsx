export default function Breadcrumbs({ items }: { items: string[] }) {
  return <nav className="text-sm text-muted-foreground mb-4">{items.join(' / ')}</nav>;
}
