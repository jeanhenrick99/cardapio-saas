import type { Align, Receipt } from '../render/receipt-doc';
import { CP860_ESCPOS_TABLE, encodeCp860 } from './cp860';

/** Comandos ESC/POS usados (padrão Epson, suportado pela maioria das térmicas). */
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export const Cmd = {
  init: [ESC, 0x40], //                       ESC @   reinicia a impressora
  codePage: (n: number) => [ESC, 0x74, n], // ESC t n tabela de caracteres
  align: (a: Align) => [ESC, 0x61, { left: 0, center: 1, right: 2 }[a]], // ESC a n
  bold: (on: boolean) => [ESC, 0x45, on ? 1 : 0], //                      ESC E n
  size: (s: 1 | 2) => [GS, 0x21, s === 2 ? 0x11 : 0x00], // GS ! n  (largura e altura x2)
  feed: (n: number) => [ESC, 0x64, n], //                    ESC d n avança n linhas
  cut: [GS, 0x56, 0x42, 0x00], //                            GS V B 0 corte parcial
} as const;

export function encodeEscPos(receipt: Receipt): Buffer {
  const chunks: Buffer[] = [];
  const cmd = (bytes: readonly number[]) => chunks.push(Buffer.from(bytes));

  cmd(Cmd.init);
  cmd(Cmd.codePage(CP860_ESCPOS_TABLE));

  for (const line of receipt.lines) {
    switch (line.kind) {
      case 'text':
        cmd(Cmd.align(line.align ?? 'left'));
        cmd(Cmd.bold(line.bold ?? false));
        cmd(Cmd.size(line.size ?? 1));
        chunks.push(encodeCp860(line.text));
        cmd([LF]);
        break;
      case 'divider':
        cmd(Cmd.align('left'));
        cmd(Cmd.bold(false));
        cmd(Cmd.size(1));
        chunks.push(encodeCp860((line.char ?? '-').repeat(receipt.columns)));
        cmd([LF]);
        break;
      case 'feed':
        cmd(Cmd.feed(line.lines));
        break;
      case 'cut':
        cmd(Cmd.cut);
        break;
    }
  }
  return Buffer.concat(chunks);
}
