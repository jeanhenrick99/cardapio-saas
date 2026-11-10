import { formatBRL, type PublicRestaurant } from '@cardapio/shared';
import { BikeIcon, ClockIcon, SearchIcon, WalletIcon } from '../ui/icons';

interface Props {
  restaurant: PublicRestaurant;
  table: string | null;
  search: string;
  onSearch: (value: string) => void;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Topo da loja: banner, logo, nome, status, tempos, pedido mínimo e busca. */
export function StoreHeader({ restaurant, table, search, onSearch }: Props) {
  const open = restaurant.acceptingOrders;
  return (
    <header className="pt-4 sm:pt-6">
      {/* Banner */}
      <div className="relative h-36 overflow-hidden rounded-2xl ring-1 ring-line sm:h-48 lg:h-56">
        {restaurant.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-start justify-center gap-2 bg-[radial-gradient(ellipse_at_top_right,var(--color-wine-deep),transparent_60%),radial-gradient(ellipse_at_bottom_left,#1a1408,transparent_55%)] bg-bg px-6 sm:px-10">
            <div className="h-px w-14 bg-gold" />
            <p className="font-display text-3xl leading-none font-semibold text-gold sm:text-5xl">{restaurant.name}</p>
            <p className="text-xs tracking-[0.3em] text-muted uppercase">Cardápio digital</p>
          </div>
        )}
      </div>

      {/* Identidade + status */}
      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface ring-1 ring-gold-deep sm:h-16 sm:w-16">
          {restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logoUrl} alt={`Logo ${restaurant.name}`} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-xl font-semibold text-gold">{initials(restaurant.name)}</span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold tracking-wide uppercase sm:text-2xl">{restaurant.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                open ? 'text-emerald-300 ring-emerald-700/70' : 'bg-wine-deep text-red-200 ring-wine-hover/60'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${open ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {open ? 'Aberto agora' : 'Fechado no momento'}
            </span>
            {table && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wider text-gold uppercase ring-1 ring-gold-deep">
                Mesa {table}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tempos, mínimo e busca */}
      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end lg:gap-6">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <li className="flex items-center gap-1.5">
            <ClockIcon className="h-5 w-5 text-gold" />
            <strong className="text-fg">{restaurant.pickupMinutes}m</strong> retirada
          </li>
          {!table && (
            <li className="flex items-center gap-1.5">
              <BikeIcon className="h-5 w-5 text-gold" />
              <strong className="text-fg">{restaurant.deliveryMinutes}m</strong> entrega
            </li>
          )}
          {!table && restaurant.minOrderCents > 0 && (
            <li className="flex items-center gap-1.5">
              <WalletIcon className="h-5 w-5 text-gold" />
              <strong className="text-fg">{formatBRL(restaurant.minOrderCents)}</strong> mínimo
            </li>
          )}
        </ul>
        <label className="relative block w-full lg:w-72">
          <span className="sr-only">Buscar no cardápio</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar no cardápio"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-10 outline-none placeholder:text-muted/70 focus:border-gold"
          />
        </label>
      </div>

      {!open && (
        <p role="status" className="mt-4 rounded-xl border border-wine-hover/60 bg-wine-deep px-4 py-3 text-sm text-red-200">
          Estamos fechados no momento. Você pode ver o cardápio, mas os pedidos estão pausados.
        </p>
      )}
    </header>
  );
}
