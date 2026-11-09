"use client";
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type TurnstileApi = { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: TurnstileApi } }

export default function LoginForm({ sitekey }: { sitekey: string }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState('');
  const widgetContainer = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  useEffect(() => {
    if (!scriptReady || !widgetContainer.current || !window.turnstile) return;
    const widget = window.turnstile.render(widgetContainer.current, {
      sitekey, action: 'login', size: 'flexible',
      callback: (value: string) => setToken(value),
      'expired-callback': () => setToken(''),
      'error-callback': () => { setToken(''); setError('Verification could not load. Please refresh and try again.'); },
    });
    widgetId.current = widget;
    return () => { window.turnstile?.remove(widget); widgetId.current = null; };
  }, [scriptReady, sitekey]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) { setError('Please complete verification.'); return; }
    setBusy(true); setError('');
    try {
      const form = new FormData(e.currentTarget);
      const body = new URLSearchParams({ username: String(form.get('username') || ''), password: String(form.get('password') || ''), turnstileToken: token });
      const response = await fetch('/api/login', { method: 'POST', body });
      if (response.ok) { window.location.href = '/admin'; return; }
      const result = await response.json(); setError(result.error || 'Unable to sign in.');
    } catch { setError('Unable to connect. Please try again.'); }
    setToken('');
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
    setBusy(false);
  }
  return <form onSubmit={submit} className="space-y-5">
    <label className="grid gap-2 text-base font-medium">Username<Input name="username" autoComplete="username" required /></label>
    <label className="grid gap-2 text-base font-medium">Password<span className="relative"><Input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required className="pr-10" /><button type="button" aria-label={showPassword ? 'Hide Password' : 'Show Password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-950">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setScriptReady(true)} onError={() => setError('Verification could not load. Please refresh and try again.')} />
    <div ref={widgetContainer} />
    {error && <p className="text-base text-red-700" role="alert">{error}</p>}
    <Button className="w-full bg-slate-950 text-white hover:bg-slate-800" disabled={busy || !token}>{busy ? 'Signing In…' : 'Sign In'}</Button>
  </form>;
}
