export function turnstileConfig() {
  const sitekey = process.env.TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const hostname = process.env.TURNSTILE_HOSTNAME?.trim().toLowerCase();
  if (!sitekey || !secret || !hostname || !/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname)) return null;
  return { sitekey, secret, hostname };
}

export async function verifyTurnstile(token: string, config: { secret: string; hostname: string }, send: typeof fetch = fetch): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  try {
    const response = await send('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.secret, response: token }),
      signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true && result.action === 'login' && result.hostname === config.hostname;
  } catch { return false; }
}
