import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center rounded-full font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-500 text-ink-0 hover:bg-accent-400 glow-accent-sm',
  ghost: 'bg-transparent text-ink-700 hover:text-accent-400 border border-ink-300 hover:border-accent-500/70',
  danger: 'bg-transparent text-red-300 hover:text-red-200 border border-red-400/50 hover:border-red-400',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-1.5 text-sm',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
}
