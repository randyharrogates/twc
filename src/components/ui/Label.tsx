import type { LabelHTMLAttributes, ReactNode } from 'react';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
}

export function Label({ className = '', children, ...rest }: LabelProps) {
  return (
    <label
      className={`mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-ink-500 ${className}`}
      {...rest}
    >
      {children}
    </label>
  );
}
