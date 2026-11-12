import type { Metadata } from 'next';
import { LoginScreen } from '@/components/panel/LoginScreen';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  return <LoginScreen />;
}
