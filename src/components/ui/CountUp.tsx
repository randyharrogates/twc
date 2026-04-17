import { useEffect, useState } from 'react';
import { animate, useMotionValue } from 'framer-motion';
import { formatMinor } from '../../lib/currency';
import type { CurrencyCode } from '../../types';

interface Props {
  valueMinor: number;
  currency: CurrencyCode;
  className?: string;
  durationMs?: number;
}

export function CountUp({ valueMinor, currency, className = '', durationMs = 1000 }: Props) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState<number>(valueMinor);

  useEffect(() => {
    const controls = animate(mv, valueMinor, {
      duration: durationMs / 1000,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [valueMinor, durationMs, mv]);

  return <span className={className}>{formatMinor(display, currency)}</span>;
}
