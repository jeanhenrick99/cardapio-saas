'use client';

import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { buildTableLinks, isLocalOnly, MAX_TABLES, normalizeBaseUrl, type TableLink } from '@/lib/table-links';
import { card, inputClass, primaryButton } from './styles';

interface Props {
  slug: string;
  restaurantName: string;
}

/** Cores do QR: módulos pretos em fundo marfim (leitores de QR não leem bem cores invertidas). */
const QR_OPTIONS = { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0b0b', light: '#f4efe6' } } as const;

export function QrCodeSheet({ slug, restaurantName }: Props) {
  const [baseInput, setBaseInput] = useState('');
  const [from, setFrom] = useState('1');
  const [count, setCount] = useState('10');
  const [includeGeneral, setIncludeGeneral] = useState(true);
  const [svgs, setSvgs] = useState<Record<string, string>>({});

  // Endereço padrão: o configurado no ambiente ou o endereço atual do navegador.
  useEffect(() => {
    setBaseInput(process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin);
  }, []);

  const baseUrl = normalizeBaseUrl(baseInput);
  const links: TableLink[] = useMemo(
    () => (baseUrl ? buildTableLinks(baseUrl, slug, { from: Number(from) || 1, count: Number(count) || 0, includeGeneral }) : []),
    [baseUrl, slug, from, count, includeGeneral],
  );

  // Gera os SVGs dos QR Codes (no navegador, sem servidor).
  useEffect(() => {
    let cancelled = false;
    Promise.all(links.map(async (l) => [l.url, await QRCode.toString(l.url, QR_OPTIONS)] as const)).then((pairs) => {
      if (!cancelled) setSvgs(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [links]);

  function download(link: TableLink) {
    const svg = svgs[link.url];
    if (!svg) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = link.table ? `qrcode-mesa-${link.table}.svg` : 'qrcode-cardapio.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="font-display text-3xl font-semibold">QR Codes das mesas</h1>
        <p className="text-sm text-muted">Imprima e cole nas mesas: o cliente escaneia e o pedido já chega com o número da mesa.</p>
      </div>

      {/* Configuração (não sai na impressão) */}
      <div className={`${card} space-y-4 print:hidden`}>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Endereço do site</span>
          <input value={baseInput} onChange={(e) => setBaseInput(e.target.value)} className={inputClass} placeholder="https://meurestaurante.com.br" />
          {!baseUrl && baseInput && <span className="mt-1 block text-xs text-red-300">Endereço inválido.</span>}
          {baseUrl && isLocalOnly(baseUrl) && (
            <span className="mt-2 block rounded-lg border border-gold-deep/60 bg-gold/10 px-3 py-2 text-xs text-gold-soft">
              ⚠ <strong>{baseUrl}</strong> só abre neste computador. Para testar no celular, use o endereço da rede que o Next mostra ao iniciar
              (ex.: http://192.168.0.10:3000). Para as mesas de verdade, use o domínio do site publicado.
            </span>
          )}
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Quantidade de mesas</span>
            <input type="number" min={0} max={MAX_TABLES} value={count} onChange={(e) => setCount(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Começar na mesa</span>
            <input type="number" min={1} value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 self-end pb-3">
            <input type="checkbox" checked={includeGeneral} onChange={(e) => setIncludeGeneral(e.target.checked)} className="h-5 w-5 accent-gold" />
            QR para retirada/delivery
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted">{links.length} QR Code(s) · {Math.ceil(links.length / 6)} página(s) A4</span>
          <button onClick={() => window.print()} disabled={links.length === 0} className={primaryButton}>
            Imprimir folha
          </button>
        </div>
      </div>

      {/* Cartões (é isto que sai na impressão) */}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-4">
        {links.map((link) => (
          <li
            key={link.url}
            className="flex break-inside-avoid flex-col items-center rounded-2xl bg-bg p-6 text-center ring-1 ring-gold-deep [print-color-adjust:exact]"
          >
            <div className="h-px w-10 bg-gold" />
            <p className="mt-3 font-display text-lg leading-tight text-gold-soft">{restaurantName}</p>
            <p className="mt-1 font-display text-4xl font-semibold text-fg">{link.table ? `Mesa ${link.table}` : 'Cardápio'}</p>
            {!link.table && <p className="text-xs tracking-[0.2em] text-muted uppercase">Retirada e delivery</p>}
            <div
              className="mt-4 w-40 overflow-hidden rounded-xl [&>svg]:h-auto [&>svg]:w-full"
              role="img"
              aria-label={`QR Code: ${link.url}`}
              // SVG gerado pela biblioteca a partir da URL do próprio cardápio
              dangerouslySetInnerHTML={{ __html: svgs[link.url] ?? '' }}
            />
            <p className="mt-4 text-xs text-muted">Aponte a câmera do celular para ver o cardápio e fazer seu pedido</p>
            <button onClick={() => download(link)} className="mt-3 text-xs font-semibold text-gold hover:text-gold-soft print:hidden">
              Baixar SVG
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
