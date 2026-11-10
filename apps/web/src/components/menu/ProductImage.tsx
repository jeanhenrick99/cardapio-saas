import { CutleryIcon } from '../ui/icons';

/** Foto do produto ou, sem foto, um marcador discreto com talheres. */
export function ProductImage({ src, alt, className = '' }: { src: string | null; alt: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- URLs de qualquer domínio cadastradas pelo restaurante
    return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-surface-2 text-gold-deep ${className}`} aria-hidden>
      <CutleryIcon className="h-8 w-8" />
    </div>
  );
}
