import { Checkbox } from '@/components/ui/checkbox';

interface EmployeeOption {
  id: number;
  name: string | null;
}

// Phase 18: the shared "who's assigned to this order" checkbox list — used by both
// CreateOrder's Admin/Manager-only assignment field and OrderDetail's edit UI, so the
// two never drift into different look-and-feel for the same underlying data.
export default function EmployeeMultiSelect({
  employees,
  selectedIds,
  onChange,
}: {
  employees: EmployeeOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  function toggle(id: number, checked: boolean) {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((i) => i !== id));
  }

  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground">No employees available.</p>;
  }

  return (
    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
      {employees.map((e) => (
        <label key={e.id} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={selectedIds.includes(e.id)}
            onCheckedChange={(checked) => toggle(e.id, checked === true)}
          />
          {e.name ?? `Employee #${e.id}`}
        </label>
      ))}
    </div>
  );
}
