import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

type Side = 'right' | 'left';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  side?: Side;
}

const sideClasses: Record<Side, string> = {
  right: 'right-0 top-0 border-l animate-[drawer-in-right_260ms_ease-out]',
  left: 'left-0 top-0 border-r animate-[drawer-in-left_260ms_ease-out]',
};

export function Drawer({ open, title, onClose, children, side = 'right' }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', handleCancel);
    return () => el.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      style={{
        width: 'min(100vw, clamp(320px, 38.2vw, 720px))',
        maxWidth: '100vw',
      }}
      className={`fixed m-0 h-screen max-h-screen overflow-hidden border-ink-300 bg-ink-100 p-0 text-ink-700 shadow-2xl ${sideClasses[side]}`}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex h-full max-h-screen flex-col">
        <div className="flex items-center justify-between border-b border-ink-200/60 px-6 py-5">
          <h2 className="font-display text-xl tracking-wide text-ink-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink-500 hover:bg-ink-200 hover:text-ink-800"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
