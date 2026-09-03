import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.js';

interface FieldProps {
  id: string;
  label: string;
  help?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/** Libellé + contrôle + aide, pour les formulaires de configuration. */
export function Field({ id, label, help, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-slate-500">{help}</p>}
    </div>
  );
}
