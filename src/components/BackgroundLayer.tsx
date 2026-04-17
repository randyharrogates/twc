interface Props {
  imageUrl?: string;
}

export function BackgroundLayer({ imageUrl }: Props) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-ink-0 via-ink-50 to-ink-0" />

      {imageUrl ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          <div className="absolute inset-0 bg-ink-0/60" />
        </>
      ) : (
        <>
          <div
            className="absolute left-1/2 top-[20%] h-[600px] w-[900px] -translate-x-1/2 rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(20,184,166,0.18), transparent 60%)',
            }}
          />
          <svg
            className="absolute inset-x-0 bottom-0 h-[60%] w-full opacity-[0.09]"
            viewBox="0 0 1200 600"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="fg1" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#05080a" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path
              fill="url(#fg1)"
              d="M0,420 L60,400 L120,430 L180,390 L260,420 L340,380 L420,410 L500,370 L600,420 L700,380 L800,420 L900,370 L1000,420 L1080,390 L1200,410 L1200,600 L0,600 Z"
            />
          </svg>
          <svg
            className="absolute inset-x-0 bottom-0 h-[45%] w-full opacity-[0.12]"
            viewBox="0 0 1200 600"
            preserveAspectRatio="none"
          >
            <path
              fill="#05080a"
              d="M0,500 L80,470 L160,490 L240,460 L320,490 L400,460 L480,490 L560,460 L640,500 L720,470 L800,500 L880,470 L960,500 L1040,470 L1120,490 L1200,470 L1200,600 L0,600 Z"
            />
          </svg>
          <svg className="absolute inset-0 h-full w-full opacity-[0.04]">
            <filter id="noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
              <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#noise)" />
          </svg>
        </>
      )}
    </div>
  );
}
