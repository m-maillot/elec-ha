import type { HTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils.js';

type Variant = 'info' | 'success' | 'warning' | 'error';

const styles: Record<Variant, { box: string; Icon: typeof Info }> = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-900', Icon: Info },
  success: { box: 'border-green-200 bg-green-50 text-green-900', Icon: CheckCircle2 },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  error: { box: 'border-red-200 bg-red-50 text-red-900', Icon: XCircle },
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export function Alert({ variant = 'info', className, children, ...props }: AlertProps) {
  const { box, Icon } = styles[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', box, className)}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
