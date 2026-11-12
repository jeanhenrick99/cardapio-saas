import type { Order, OrderStatus } from '@cardapio/shared';
import type { CashSummary, SalesReport } from '@cardapio/shared';

export type Role = 'OWNER' | 'STAFF';

export interface Me {
  id: string;
  email: string;
  name: string;
  /** Administrador da plataforma (suporte): acessa todos os restaurantes pela área /admin. */
  isPlatformAdmin: boolean;
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

export interface CashRegisterView {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openedBy: string;
  openingCents: number;
  closedAt: string | null;
  closedBy: string | null;
  countedCents: number | null;
  expectedCashCents: number | null;
  differenceCents: number | null;
  notes: string | null;
}

export interface CashRegisterDetail extends CashRegisterView {
  summary: CashSummary;
  movements: { id: string; kind: 'SANGRIA' | 'SUPRIMENTO'; amountCents: number; reason: string; createdAt: string; createdBy: string }[];
}

export interface CashResponse {
  current: CashRegisterDetail | null;
  recent: CashRegisterView[];
}

export interface SalesReportResponse extends SalesReport {
  registers: {
    id: string;
    openedAt: string;
    closedAt: string;
    openedBy: string;
    closedBy: string | null;
    salesCents: number;
    expectedCashCents: number | null;
    countedCents: number | null;
    differenceCents: number | null;
  }[];
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: Role;
  since: string;
  isYou: boolean;
  canResetPassword: boolean;
}

export interface PendingInvite {
  id: string;
  name: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdBy: string;
}

export interface TeamResponse {
  members: TeamMember[];
  invites: PendingInvite[];
}
