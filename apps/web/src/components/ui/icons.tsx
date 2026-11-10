/** Ícones em SVG inline (sem biblioteca), herdam a cor do texto. */
type Props = { className?: string };
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const ClockIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const BikeIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <circle cx="6" cy="17" r="3" />
    <circle cx="18" cy="17" r="3" />
    <path d="M6 17h4l3-6h4l1 6M13 11l-2-4H8M17 11V7h2" />
  </svg>
);

export const WalletIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18M16 14.5h2" />
  </svg>
);

export const SearchIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const CutleryIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M17 21V3c-2 1-3 3.5-3 7v3h3" />
  </svg>
);
