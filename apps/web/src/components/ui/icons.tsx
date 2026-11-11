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

export const HomeIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" />
  </svg>
);

export const ReceiptIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6M9 16h3" />
  </svg>
);

export const BookIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h13" />
    <path d="M9 7h6" />
  </svg>
);

export const StoreIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M4 9l1.5-5h13L20 9M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11V9zM5 13v8h14v-8M10 21v-5h4v5" />
  </svg>
);

export const PrinterIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M7 8V3h10v5M7 17H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-3M7 14h10v7H7z" />
  </svg>
);

export const MenuIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const ChevronIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const SwapIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
  </svg>
);

export const ExternalIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

export const LogoutIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
  </svg>
);

export const ChartIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const QrIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2" />
  </svg>
);

export const PosIcon = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
    <rect x="4" y="3" width="16" height="10" rx="1.5" />
    <path d="M8 7h8M3 21h18l-1.5-5h-15L3 21zM9 18.5h6" />
  </svg>
);
