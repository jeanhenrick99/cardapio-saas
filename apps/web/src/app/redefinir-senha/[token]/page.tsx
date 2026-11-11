import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/panel/LinkForms';
import { Brand } from '@/components/ui/Brand';

// O token vai na URL: não repassar o endereço para outros sites nem indexar.
export const metadata: Metadata = { title: 'Nova senha', referrer: 'no-referrer', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <Brand size="md" href="/" />
        <div className="mx-auto my-4 h-px w-12 bg-gold" />
        <h1 className="font-display text-2xl font-semibold">Redefinir senha</h1>
      </div>
      <ResetPasswordForm token={token} />
    </main>
  );
}
