import { useActiveSection } from '../hooks/useActiveSection';

const SECTIONS = [
  { id: 'home', label: 'HOME' },
  { id: 'groups', label: 'GROUPS' },
  { id: 'expenses', label: 'EXPENSES' },
  { id: 'settlement', label: 'SETTLEMENT' },
];

export function Nav() {
  const active = useActiveSection(SECTIONS.map((s) => s.id));

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-ink-200/60 bg-ink-0/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <button
          onClick={() => scrollTo('home')}
          className="font-display text-xl tracking-wider text-ink-800 hover:text-accent-400"
        >
          TWC
          <span className="ml-1 text-accent-400">.</span>
        </button>
        <ul className="hidden gap-8 md:flex">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => scrollTo(s.id)}
                className={`relative font-display text-sm tracking-widest transition-colors ${
                  active === s.id ? 'text-accent-400' : 'text-ink-600 hover:text-ink-800'
                }`}
              >
                {s.label}
                {active === s.id && (
                  <span className="absolute -bottom-1 left-0 right-0 h-[2px] bg-accent-400" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
