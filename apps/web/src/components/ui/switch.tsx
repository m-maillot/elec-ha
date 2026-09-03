import { cn } from '../../lib/utils.js';

interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}

/** Interrupteur accessible (role="switch") avec libellé. */
export function Switch({ id, checked, onCheckedChange, disabled, label, className }: SwitchProps) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-sm',
        disabled && 'opacity-60',
        className,
      )}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
          checked ? 'bg-slate-900' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
      <span>{label}</span>
    </label>
  );
}
