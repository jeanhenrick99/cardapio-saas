import type { PrinterConfig } from '../config';
import { NetworkPrinter } from './network';
import type { PrinterDriver } from './types';
import { VirtualPrinter } from './virtual';

export function createDriver(config: PrinterConfig): PrinterDriver {
  switch (config.type) {
    case 'virtual':
      return new VirtualPrinter(config);
    case 'network':
      return new NetworkPrinter(config);
  }
}

export function createDrivers(configs: PrinterConfig[]): Map<string, PrinterDriver> {
  return new Map(configs.map((c) => [c.name, createDriver(c)]));
}

export type { PrinterDriver, PrintRequest } from './types';
