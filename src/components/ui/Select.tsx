import type { SelectHTMLAttributes } from 'react';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = '', children, ...rest }: SelectProps) {
  return (
    <select
      className={`w-full rounded-lg border border-ink-300 bg-ink-100/70 px-3 py-2 text-sm text-ink-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
