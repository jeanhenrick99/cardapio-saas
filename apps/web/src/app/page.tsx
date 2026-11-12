import type { Metadata } from 'next';
import { LoginScreen } from '@/components/panel/LoginScreen';

export const metadata: Metadata = { title: { absolute: 'Entrar · Bistroo' } };

/** A página inicial é a entrada do sistema. O cardápio do cliente fica em /r/<restaurante>. */
export default function Home() {
  return <LoginScreen />;
}
