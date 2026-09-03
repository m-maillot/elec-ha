import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils.js';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  default: 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400',
  outline: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
  ghost: 'text-slate-700 hover:bg-slate-100',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
