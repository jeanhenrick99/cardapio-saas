import type { Order } from '@cardapio/shared';

export type Role = 'OWNER' | 'STAFF';

export interface Me {
  id: string;
  email: string;
  name: string;
  restaurants: { id: string; name: string; slug: string; role: Role }[];
}

export type PrintStatus = 'QUEUED' | 'SENT' | 'PRINTED' | 'FAILED';

export interface PanelOrder extends Order {
  totalCents: number;
  print: {
    status: PrintStatus;
    printers: { name: string; status: 'printed' | 'failed'; error?: string }[] | null;
    completedAt: string | null;
  } | null;
}

export interface StoreSettings {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  coverUrl: string | null;
  acceptingOrders: boolean;
  pickupMinutes: number;
  deliveryMinutes: number;
  minOrderCents: number;
}

export interface Agent {
  id: string;
  name: string;
  version: string | null;
  printers: string[];
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  online: boolean;
}
