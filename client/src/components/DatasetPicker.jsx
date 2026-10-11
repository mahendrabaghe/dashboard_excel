import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Select } from './ui/index.jsx';

/** Loads the user's datasets and lets the caller choose one. Controlled via value/onChange. */
export function DatasetPicker({ value, onChange, className }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .listDatasets(1, 100)
      .then((d) => {
        if (!alive) return;
        const ready = d.items.filter((x) => x.status === 'ready');
        setItems(ready);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (items === null) return <div className="h-9 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />;
  return (
    <Select value={value || ''} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Dataset">
      <option value="">{items.length ? 'Select a dataset' : 'No datasets yet'}</option>
      {items.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name} ({d.rowCount.toLocaleString()} rows)
        </option>
      ))}
    </Select>
  );
}
