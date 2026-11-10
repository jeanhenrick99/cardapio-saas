import type { Receipt } from '../render/receipt-doc';

export interface PrintRequest {
  jobId: string;
  receipt: Receipt;
  /** Bytes ESC/POS já prontos para enviar à impressora. */
  bytes: Buffer;
}

export interface PrinterDriver {
  readonly name: string;
  print(request: PrintRequest): Promise<void>;
}
