import type { Order, OrderStatus } from '@cardapio/shared';

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
  status: OrderStatus;
  statusChangedAt: string;
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
  tableCount: number;
  serviceFeePercent: number;
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

export type TabKind = 'MESA' | 'COMANDA';

export interface TabSummary {
  id: string;
  kind: TabKind;
  number: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  ordersCount: number;
  consumedCents: number;
  lastOrderAt: string | null;
  paymentMethod: string | null;
  subtotalCents: number | null;
  serviceFeeCents: number | null;
  discountCents: number | null;
  totalCents: number | null;
}

export interface TabsResponse {
  tableCount: number;
  serviceFeePercent: number;
  open: TabSummary[];
  closed: TabSummary[];
}

export interface TabDetail extends TabSummary {
  serviceFeePercent: number;
  orders: {
    id: string;
    number: number;
    createdAt: string;
    status: OrderStatus;
    totalCents: number;
    origin: 'cardapio' | 'pdv';
    staffName?: string;
    notes?: string;
    items: Order['items'];
  }[];
}
