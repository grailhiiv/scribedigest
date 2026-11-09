import { redirect } from 'next/navigation';
import { configured, signedIn } from '@/lib/auth';
import LoginForm from './form';
import { turnstileConfig } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await signedIn()) redirect('/admin');
  const security = turnstileConfig();
  return <main className="flex min-h-screen items-center justify-center bg-white px-4 py-12 text-slate-950"><div className="w-full max-w-sm"><div className="workspace-title mb-6 text-center font-semibold">Scribe Digest</div><div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><h1 className="sr-only">Sign In</h1>{configured() && security ? <LoginForm sitekey={security.sitekey} /> : <div className="rounded-md bg-slate-100 p-4 text-base leading-relaxed text-slate-600">Admin access or sign-in security is not configured. Check the setup instructions and restart the app.</div>}</div></div></main>;
}
