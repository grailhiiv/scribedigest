import { NextResponse } from 'next/server';
import { checkPassword, login, sameOrigin } from '@/lib/auth';
import { readLimitedBody } from '@/lib/request-body';
import { turnstileConfig, verifyTurnstile } from '@/lib/turnstile';

// A process-local backstop. The Cloudflare rate-limiting rule is the primary limit.
let windowStart = 0;
let attempts = 0;
const windowMs = 15 * 60 * 1000;
export async function POST(req: Request) {
  if (!await sameOrigin()) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  const config = turnstileConfig();
  if (!config) return NextResponse.json({ error: 'Sign-in security is not configured.' }, { status: 503 });
  const now = Date.now();
  if (now >= windowStart + windowMs) { windowStart = now; attempts = 0; }
  if (attempts >= 8) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))) } });
  attempts++;
  let form: URLSearchParams;
  try {
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) throw new Error();
    form = new URLSearchParams(await readLimitedBody(req, 8192));
  } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!await verifyTurnstile(form.get('turnstileToken') || '', config)) return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 403 });
  if (!checkPassword(form.get('username') || '', form.get('password') || '')) return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  await login();
  return NextResponse.json({ ok: true });
}
