interface Props {
  className?: string;
}

export function Mascot({ className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient id="coin-body" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="55%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0f766e" />
        </radialGradient>
        <radialGradient id="coin-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="95" fill="url(#coin-glow)" />
      <circle
        cx="100"
        cy="100"
        r="64"
        fill="url(#coin-body)"
        stroke="#2dd4bf"
        strokeWidth="1.5"
      />
      <circle cx="100" cy="100" r="54" fill="none" stroke="#0b1012" strokeOpacity="0.25" strokeWidth="1" />
      <text
        x="100"
        y="118"
        textAnchor="middle"
        fontFamily="Bebas Neue, Impact, sans-serif"
        fontSize="56"
        fill="#05080a"
        opacity="0.85"
      >
        $
      </text>
      <circle cx="78" cy="84" r="8" fill="#f2f4f5" opacity="0.55" />
    </svg>
  );
}
