import { createConnection } from 'node:net';
import type { NetworkPrinterConfig } from '../config';
import type { PrinterDriver, PrintRequest } from './types';

/**
 * Impressora de rede (Ethernet/Wi-Fi): a maioria aceita ESC/POS "cru"
 * na porta TCP 9100 (RAW / JetDirect).
 */
export class NetworkPrinter implements PrinterDriver {
  readonly name: string;

  constructor(private readonly config: NetworkPrinterConfig) {
    this.name = config.name;
  }

  print({ bytes }: PrintRequest): Promise<void> {
    const { host, port, timeoutMs } = this.config;
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };

      const socket = createConnection({ host, port });
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        socket.end(bytes);
      });
      socket.once('timeout', () => socket.destroy(new Error(`TIMEOUT (${host}:${port})`)));
      socket.once('error', (err) => done(new Error(`${err.message} (${host}:${port})`)));
      socket.once('close', (hadError) => {
        if (!hadError) done();
      });
    });
  }
}
