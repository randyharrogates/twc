import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}

export function Dialog({ open, title, onClose, children, widthClass = 'max-w-lg' }: DialogProps) {
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
      className={`m-auto max-h-[90vh] w-[95vw] ${widthClass} overflow-hidden rounded-2xl border border-ink-300 bg-ink-100 p-0 text-ink-700 shadow-2xl open:animate-[dialog-in_200ms_ease-out]`}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex items-center justify-between border-b border-ink-200/60 px-5 py-4">
          <h2 className="font-display text-lg tracking-wide text-ink-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink-500 hover:bg-ink-200 hover:text-ink-800"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
      <style>{`
        @keyframes dialog-in {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </dialog>
  );
}
