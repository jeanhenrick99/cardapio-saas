import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { VirtualPrinterConfig } from '../config';
import type { Align, Receipt } from '../render/receipt-doc';
import type { PrinterDriver, PrintRequest } from './types';

function alignText(text: string, width: number, align: Align): string {
  const free = Math.max(0, width - text.length);
  if (align === 'right') return ' '.repeat(free) + text;
  if (align === 'center') return ' '.repeat(Math.floor(free / 2)) + text;
  return text;
}

/** Simula o papel térmico em texto. Fonte dupla vira letras espaçadas: "P E D I D O". */
export function renderPreview(receipt: Receipt): string[] {
  const { columns } = receipt;
  const out: string[] = [];
  for (const line of receipt.lines) {
    switch (line.kind) {
      case 'text': {
        const content = line.size === 2 ? [...line.text].join(' ') : line.text;
        out.push(alignText(content, columns, line.align ?? 'left'));
        break;
      }
      case 'divider':
        out.push((line.char ?? '-').repeat(columns));
        break;
      case 'feed':
        for (let i = 0; i < line.lines; i++) out.push('');
        break;
      case 'cut': {
        const label = ' ✂ corte ';
        const side = Math.floor((columns - label.length) / 2);
        out.push('-'.repeat(side) + label + '-'.repeat(columns - side - label.length));
        break;
      }
    }
  }
  return out;
}

export function boxed(lines: string[], columns: number, title: string): string {
  const top = `┌─ ${title} ${'─'.repeat(Math.max(0, columns - title.length - 2))}┐`;
  const body = lines.map((l) => `│ ${l.padEnd(columns)} │`);
  return [top, ...body, `└${'─'.repeat(columns + 2)}┘`].join('\n');
}

/**
 * Impressora virtual: em vez de papel, mostra o cupom no terminal e salva
 * `.txt` (prévia) e `.bin` (bytes ESC/POS reais) na pasta de saída.
 */
export class VirtualPrinter implements PrinterDriver {
  readonly name: string;

  constructor(
    private readonly config: VirtualPrinterConfig,
    private readonly random: () => number = Math.random,
  ) {
    this.name = config.name;
  }

  async print({ jobId, receipt, bytes }: PrintRequest): Promise<void> {
    if (this.random() < this.config.failureRate) {
      throw new Error('PAPER_OUT (falha simulada)');
    }
    const preview = boxed(renderPreview(receipt), receipt.columns, `🖨  ${this.name}`);
    console.log(`\n${preview}\n`);

    const dir = resolve(this.config.outputDir);
    await mkdir(dir, { recursive: true });
    const base = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${jobId}_${this.name}`);
    await writeFile(`${base}.txt`, `${preview}\n`, 'utf8');
    await writeFile(`${base}.bin`, bytes);
  }
}
