import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PERMISSION_MODULES,
  PERMISSION_PRESETS,
  EMPLOYEE_MANAGE_PERMISSIONS_GRANT,
  MESSAGE_MANAGE_GRANT,
  ADMIN_ONLY_PERMISSIONS,
  type DataScope,
  type PermissionState,
} from '@/lib/permissions';

// Phase 15 addendum: the shared Role+Permissions+Data Scope editor, used both by the
// Admin approval panel (approving a pending signup) and the existing per-user
// Permissions dialog (editing an already-active Manager/Employee later) — one
// picker, not two different UIs for the same underlying data.
export default function PermissionPicker({
  value,
  onChange,
  showDelegatedGrant,
  editorIsAdmin = false,
}: {
  value: PermissionState;
  onChange: (next: PermissionState) => void;
  /** Phase 32 D8: only an Admin may grant/remove the WhatsApp messaging permissions
   *  (the server enforces it); for anyone else they're shown read-only and kept. */
  editorIsAdmin?: boolean;
  // Only Admin editing a Manager sees this — it's administrative authority
  // (can this Manager edit their own Employees' permissions), not a business
  // permission, so it's deliberately not part of the module grid above.
  showDelegatedGrant?: boolean;
}) {
  function toggle(permission: string, checked: boolean) {
    onChange({
      ...value,
      permissions: checked
        ? [...value.permissions, permission]
        : value.permissions.filter((p) => p !== permission),
    });
  }

  // Permissions a preset must NOT change: the explicit administrative grants always
  // (a preset never grants or removes them), and — when the editor isn't an Admin —
  // message:resend too (only an Admin may change it).
  const presetKeeps = [
    EMPLOYEE_MANAGE_PERMISSIONS_GRANT,
    MESSAGE_MANAGE_GRANT,
    ...(editorIsAdmin ? [] : ADMIN_ONLY_PERMISSIONS),
  ];

  function applyPreset(presetValue: string) {
    const preset = PERMISSION_PRESETS.find((p) => p.value === presetValue);
    if (!preset) return;
    // A preset never grants the delegated Manager-permissions-editing authority or
    // message:manage — those stay explicit, separate decisions even with "Full Access".
    // Phase 32 D8: every kept permission stays exactly as it was (present or absent).
    const fromPreset = preset.state.permissions.filter((p) => !presetKeeps.includes(p));
    const kept = value.permissions.filter((p) => presetKeeps.includes(p));
    onChange({ ...preset.state, permissions: [...new Set([...fromPreset, ...kept])] });
  }

  const lockedForEditor = (permission: string) => !editorIsAdmin && ADMIN_ONLY_PERMISSIONS.includes(permission);

  function setScope(key: 'customerDataScope' | 'orderDataScope', scope: DataScope) {
    onChange({ ...value, [key]: scope });
  }

  return (
    <div className="space-y-5">
      <Select onValueChange={applyPreset}>
        <SelectTrigger>
          <SelectValue placeholder="Apply a preset…" />
        </SelectTrigger>
        <SelectContent>
          {PERMISSION_PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {PERMISSION_MODULES.map((module) => (
        <div key={module.label} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {module.label}
            </span>
            {module.scopeKey && (
              <div className="flex gap-1">
                {(['ALL', 'ASSIGNED'] as const).map((scope) => (
                  <Button
                    key={scope}
                    type="button"
                    size="sm"
                    variant={value[module.scopeKey!] === scope ? 'default' : 'outline'}
                    onClick={() => setScope(module.scopeKey!, scope)}
                  >
                    {scope === 'ALL' ? `All ${module.label}` : 'Assigned only'}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {module.permissions.map((permission) => (
              <label key={permission.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={value.permissions.includes(permission.value)}
                  disabled={lockedForEditor(permission.value)}
                  aria-label={permission.value}
                  onCheckedChange={(checked) => toggle(permission.value, checked === true)}
                />
                {permission.label}
                {lockedForEditor(permission.value) && (
                  <span className="text-xs text-muted-foreground">(only an Admin can change this)</span>
                )}
              </label>
            ))}
          </div>
        </div>
      ))}

      {(showDelegatedGrant || editorIsAdmin) && (
        <div className="space-y-2 border-t pt-3">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Administrative
          </span>
          {showDelegatedGrant && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={value.permissions.includes(EMPLOYEE_MANAGE_PERMISSIONS_GRANT)}
              onCheckedChange={(checked) => toggle(EMPLOYEE_MANAGE_PERMISSIONS_GRANT, checked === true)}
              className="mt-0.5"
            />
            <span>
              Allow this Manager to edit their own Employees&apos; permissions
              <span className="block text-xs text-muted-foreground">
                Not included in any preset — granted explicitly.
              </span>
            </span>
          </label>
          )}
          {editorIsAdmin && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={value.permissions.includes(MESSAGE_MANAGE_GRANT)}
                onCheckedChange={(checked) => toggle(MESSAGE_MANAGE_GRANT, checked === true)}
                aria-label={MESSAGE_MANAGE_GRANT}
                className="mt-0.5"
              />
              <span>
                Manage WhatsApp messaging
                <span className="block text-xs text-muted-foreground">
                  Settings → WhatsApp Messaging: resolve unconfirmed messages, resume sending, refresh
                  templates. Not included in any preset — granted explicitly.
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
