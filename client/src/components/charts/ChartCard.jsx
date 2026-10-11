import { useRef, useState } from 'react';
import { Copy, Trash2, Download, Settings2, GripVertical } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer.jsx';
import { Button } from '../ui/index.jsx';
import { exportChartPng } from '../../services/exporters.js';
import { useToast } from '../../context/ToastContext.jsx';
import { cn } from '../../lib/utils.js';

/** A chart panel with title/description, export and action buttons. */
export function ChartCard({ title, description, children, onEdit, onDuplicate, onDelete, className, dragHandle, exportName, actions, fullHeight }) {
  const ref = useRef(null);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const doExport = async () => {
    setExporting(true);
    try {
      await exportChartPng(ref.current, exportName || title || 'chart');
      toast.success('Chart image downloaded.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={cn('card flex h-full min-w-0 flex-col overflow-hidden p-4 transition-shadow hover:shadow-lg', className)}>
      <div className="mb-3 flex items-start gap-2">
        {dragHandle && <span className="drag-handle cursor-move pt-0.5 text-slate-300 hover:text-slate-500" title="Drag to move"><GripVertical className="h-4 w-4" /></span>}
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold" title={title}>{title}</h4>
          {description && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        <div className="no-print flex shrink-0 items-center gap-0.5">
          {actions}
          {onEdit && <IconBtn label="Edit chart" onClick={onEdit}><Settings2 className="h-4 w-4" /></IconBtn>}
          {onDuplicate && <IconBtn label="Duplicate chart" onClick={onDuplicate}><Copy className="h-4 w-4" /></IconBtn>}
          <IconBtn label="Download as PNG" onClick={doExport} disabled={exporting}><Download className="h-4 w-4" /></IconBtn>
          {onDelete && <IconBtn label="Delete chart" onClick={onDelete} danger><Trash2 className="h-4 w-4" /></IconBtn>}
        </div>
      </div>
      <div ref={ref} className={cn('min-w-0 flex-1', fullHeight && 'min-h-0')}>
        {children}
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children, danger, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200',
        danger && 'hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40'
      )}
    >
      {children}
    </button>
  );
}

export { ChartRenderer, Button };
