import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Check, Loader2, Pencil, Plus, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { openArticleNumberTracking } from '@/lib/articleTracking';
import {
  ARTICLE_NUMBER_FORMAT_HINT,
  INDIA_POST_ARTICLE_NUMBER_REGEX,
  normalizeArticleNumber,
} from '@/lib/articleNumber';

// Phase 22: inline Article No. add/edit, shared by the Orders list (desktop rows +
// mobile cards) and Order Details' Delivery card. UI state only — the page owns
// the save (one mutation per page, not one per row) and all cache handling; this
// just awaits onSave and shows saving/error. Clicks and keys never bubble, so
// using it inside a mobile card's <Link> doesn't open the order.
export default function ArticleNumberEditor({
  articleNumber,
  canEdit,
  onSave,
}: {
  articleNumber: string | null;
  canEdit: boolean;
  onSave: (articleNumber: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setValue(articleNumber ?? '');
    setError(null);
    setEditing(true);
  }

  function cancel() {
    if (saving) return;
    setEditing(false);
    setError(null);
  }

  async function save() {
    if (saving) return;
    const normalized = normalizeArticleNumber(value);
    // Same number (ignoring case/spaces) → nothing to do, no request at all.
    if (normalized === normalizeArticleNumber(articleNumber ?? '')) {
      setEditing(false);
      setError(null);
      return;
    }
    if (normalized && !INDIA_POST_ARTICLE_NUMBER_REGEX.test(normalized)) {
      setError(ARTICLE_NUMBER_FORMAT_HINT);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(normalized);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save Article No.');
    } finally {
      setSaving(false);
    }
  }

  // preventDefault only on click (that's what stops a parent <Link> navigating) —
  // doing it on keydown too would block typing into the input.
  function stopClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  if (editing) {
    return (
      <span
        className="inline-flex flex-col gap-1"
        onClick={stopClick}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="flex items-center gap-1">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="AB123456789IN"
            disabled={saving}
            aria-label="Article No."
            aria-invalid={!!error}
            className="h-8 w-40 uppercase"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            aria-label="Save Article No."
            className="rounded p-1 text-primary hover:bg-accent disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            aria-label="Cancel"
            className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>
    );
  }

  if (!articleNumber) {
    if (!canEdit) return <>—</>;
    return (
      <button
        type="button"
        onClick={(e) => {
          stopClick(e);
          startEditing();
        }}
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add Article No.
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          stopClick(e);
          openArticleNumberTracking(articleNumber);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            openArticleNumberTracking(articleNumber);
          }
        }}
        className="cursor-pointer text-primary hover:underline"
      >
        {articleNumber}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            stopClick(e);
            startEditing();
          }}
          aria-label="Edit Article No."
          className="text-primary hover:underline"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
