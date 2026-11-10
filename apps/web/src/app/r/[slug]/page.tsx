import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MenuApp } from '@/components/menu/MenuApp';
import { getPublicMenu } from '@/lib/api';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mesa?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const menu = await getPublicMenu((await params).slug);
  return { title: menu?.restaurant.name ?? 'Cardápio' };
}

/** Página do cardápio. O QR Code da mesa aponta para /r/<restaurante>?mesa=<número>. */
export default async function MenuPage({ params, searchParams }: Props) {
  const [{ slug }, { mesa }] = await Promise.all([params, searchParams]);
  const menu = await getPublicMenu(slug);
  if (!menu) notFound();

  const table = mesa?.trim().slice(0, 20) || null;
  return <MenuApp menu={menu} table={table} />;
}
