import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';

// Playfair Display (serifada) nos títulos dá o ar premium; Inter no texto mantém a leitura fácil no celular.
const display = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Cardápio Digital', template: '%s · Cardápio Digital' },
  description: 'Faça seu pedido pelo celular, direto da mesa.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
