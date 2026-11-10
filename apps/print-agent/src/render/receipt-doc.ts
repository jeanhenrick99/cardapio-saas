/**
 * Modelo intermediário do cupom, independente da impressora.
 *
 *   Pedido ──buildTicket──▶ Receipt ──┬─ encodeEscPos ──▶ bytes (impressora real)
 *                                     └─ renderPreview ─▶ texto (impressora virtual)
 */
export type Align = 'left' | 'center' | 'right';
export type Columns = 32 | 48;

export type ReceiptLine =
  | { kind: 'text'; text: string; align?: Align; bold?: boolean; size?: 1 | 2 }
  | { kind: 'divider'; char?: string }
  | { kind: 'feed'; lines: number }
  | { kind: 'cut' };

export interface Receipt {
  columns: Columns;
  lines: ReceiptLine[];
}
