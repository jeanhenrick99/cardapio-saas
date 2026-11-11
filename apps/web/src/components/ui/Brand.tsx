import Link from 'next/link';

export const BRAND = 'Bistroo';

/** Logotipo em texto: "Bistroo" em serifa, com os dois "o" em dourado. */
export function Brand({ size = 'md', href }: { size?: 'sm' | 'md' | 'lg'; href?: string }) {
  const text = { sm: 'text-lg', md: 'text-3xl', lg: 'text-5xl' }[size];
  const mark = (
    <span className={`font-display font-semibold tracking-tight ${text}`} aria-label={BRAND}>
      Bistr<span className="text-gold">oo</span>
    </span>
  );
  return href ? (
    <Link href={href} className="hover:opacity-90">
      {mark}
    </Link>
  ) : (
    mark
  );
}
