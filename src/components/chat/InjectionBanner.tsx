interface Props {
  onDismiss: () => void;
}

export function InjectionBanner({ onDismiss }: Props) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
    >
      <div className="flex-1 leading-relaxed">
        <strong className="mr-1 text-amber-100">Heads up:</strong>
        this assistant reads receipt text. If a receipt contains instructions, treat drafts skeptically and
        verify every amount before accepting.
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-full px-2 py-0.5 text-amber-300 hover:bg-amber-500/20"
        aria-label="Dismiss prompt-injection warning"
      >
        ×
      </button>
    </div>
  );
}
