import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  id?: string;
  children: ReactNode;
  className?: string;
}

export function SectionReveal({ id, children, className = '' }: Props) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.section>
  );
}
