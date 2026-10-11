import { Plus, Trash2, FilterX } from 'lucide-react';
import { Button, Select, Input } from '../ui/index.jsx';
import { OPERATORS, EMPTY_FILTER, countActiveConditions } from '../../utils/filters.js';
import { uid } from '../../lib/utils.js';

const kindOf = (col) => (col?.type === 'number' || col?.type === 'date' || col?.type === 'boolean' ? col.type : 'text');

function ConditionRow({ cond, columns, onChange, onRemove, distinctValues }) {
  const col = columns.find((c) => c.key === cond.key);
  const kind = kindOf(col);
  const ops = OPERATORS[kind] || OPERATORS.text;
  const needsValue = !['is_empty', 'not_empty'].includes(cond.op);
  const isBetween = cond.op === 'between';
  // Offer a dropdown of distinct values for low-cardinality text columns
  const distinct = kind === 'text' ? distinctValues?.[cond.key] || null : null;

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[1.1fr_1fr_1.2fr_auto]">
      <Select value={cond.key} onChange={(e) => onChange({ ...cond, key: e.target.value, op: (OPERATORS[kindOf(columns.find((c) => c.key === e.target.value))] || OPERATORS.text)[0][0], value: '', value2: '' })} aria-label="Column">
        <option value="">Select column</option>
        {columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
      </Select>
      <Select value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value })} aria-label="Operator" disabled={!col}>
        {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        {needsValue && kind === 'boolean' && (
          <Select value={String(cond.value)} onChange={(e) => onChange({ ...cond, value: e.target.value === 'true' })} aria-label="Value">
            <option value="true">True</option>
            <option value="false">False</option>
          </Select>
        )}
        {needsValue && kind !== 'boolean' && distinct && cond.op !== 'contains' ? (
          cond.op === 'in' ? (
            <Input placeholder="Comma separated values" value={Array.isArray(cond.value) ? cond.value.join(',') : cond.value || ''} onChange={(e) => onChange({ ...cond, value: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} aria-label="Values" />
          ) : (
            <Select value={cond.value ?? ''} onChange={(e) => onChange({ ...cond, value: e.target.value })} aria-label="Value">
              <option value="">Choose value</option>
              {distinct.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
          )
        ) : needsValue && kind !== 'boolean' ? (
          <Input type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'} placeholder={kind === 'text' ? 'Value' : undefined} value={cond.value ?? ''} onChange={(e) => onChange({ ...cond, value: e.target.value })} aria-label="Value" />
        ) : null}
        {isBetween && kind !== 'boolean' && (
          <Input type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'} value={cond.value2 ?? ''} onChange={(e) => onChange({ ...cond, value2: e.target.value })} aria-label="Upper value" />
        )}
      </div>
      <button onClick={onRemove} className="justify-self-end rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40" aria-label="Remove condition">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Filter editor: groups of conditions. Each group combines its conditions with its own
 * AND/OR logic; groups combine with the top-level logic.
 * `distinctValues` maps column key -> array of distinct values (from the working table).
 */
export function FilterBuilder({ value, onChange, columns, distinctValues, title = 'Filters' }) {
  const filter = value || EMPTY_FILTER;
  const update = (next) => onChange(next);

  const setGroup = (gi, patch) => update({ ...filter, groups: filter.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) });
  const addGroup = () => {
    if (!columns.length) return;
    update({ ...filter, groups: [...filter.groups, { id: uid('g'), logic: 'AND', conditions: [newCond(columns)] }] });
  };
  const addCond = (gi) => setGroup(gi, { conditions: [...filter.groups[gi].conditions, newCond(columns)] });
  const removeCond = (gi, ci) => {
    const conditions = filter.groups[gi].conditions.filter((_, i) => i !== ci);
    update({ ...filter, groups: filter.groups.map((g, i) => (i === gi ? { ...g, conditions } : g)).filter((g) => g.conditions.length) });
  };
  const updateCond = (gi, ci, c) => setGroup(gi, { conditions: filter.groups[gi].conditions.map((x, i) => (i === ci ? c : x)) });

  const count = countActiveConditions(filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {count > 0 && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">{count} active</span>}
        </div>
        <div className="flex items-center gap-2">
          {filter.groups.length > 1 && (
            <label className="flex items-center gap-1 text-xs text-slate-500">
              Combine groups
              <Select className="h-8 w-20" value={filter.logic || 'AND'} onChange={(e) => update({ ...filter, logic: e.target.value })}>
                <option>AND</option>
                <option>OR</option>
              </Select>
            </label>
          )}
          <Button size="sm" variant="secondary" onClick={addGroup} disabled={!columns.length}>
            <Plus className="h-3.5 w-3.5" /> Add group
          </Button>
          <Button size="sm" variant="ghost" onClick={() => update(EMPTY_FILTER)} disabled={!count}>
            <FilterX className="h-3.5 w-3.5" /> Clear all
          </Button>
        </div>
      </div>

      {filter.groups.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700">
          No filters applied. Add a group to filter rows by text, number, date or boolean conditions.
        </p>
      )}

      {filter.groups.map((g, gi) => (
        <div key={g.id || gi} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Group {gi + 1}</span>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              Match
              <Select className="h-7 w-20" value={g.logic || 'AND'} onChange={(e) => setGroup(gi, { logic: e.target.value })} aria-label="Group logic">
                <option>AND</option>
                <option>OR</option>
              </Select>
              of conditions
              <button onClick={() => update({ ...filter, groups: filter.groups.filter((_, i) => i !== gi) })} className="ml-2 text-rose-600 hover:underline">Remove group</button>
            </div>
          </div>
          {g.conditions.map((c, ci) => (
            <ConditionRow key={ci} cond={c} columns={columns} distinctValues={distinctValues} onChange={(nc) => updateCond(gi, ci, nc)} onRemove={() => removeCond(gi, ci)} />
          ))}
          <Button size="sm" variant="ghost" onClick={() => addCond(gi)}>
            <Plus className="h-3.5 w-3.5" /> Add condition
          </Button>
        </div>
      ))}
    </div>
  );
}

function newCond(columns) {
  const c = columns[0];
  const kind = kindOf(c);
  return { key: c?.key || '', op: (OPERATORS[kind] || OPERATORS.text)[0][0], value: kind === 'boolean' ? true : '', value2: '' };
}

/** Active filter chips with a remove-all action, shown above tables and charts. */
export function FilterChips({ filter, columns, onClear }) {
  const count = countActiveConditions(filter);
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500">Active filters:</span>
      {filter.groups.flatMap((g, gi) =>
        g.conditions.map((c, ci) => {
          const col = columns.find((x) => x.key === c.key);
          const v = Array.isArray(c.value) ? c.value.join(', ') : c.value;
          const label = ['is_empty', 'not_empty'].includes(c.op) ? `${col?.name}: ${c.op === 'is_empty' ? 'empty' : 'not empty'}` : `${col?.name ?? '?'} ${c.op} ${v ?? ''}${c.op === 'between' ? ` – ${c.value2}` : ''}`;
          return <span key={`${gi}-${ci}`} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{label}</span>;
        })
      )}
      <button onClick={onClear} className="text-xs text-rose-600 hover:underline">Clear all</button>
    </div>
  );
}
