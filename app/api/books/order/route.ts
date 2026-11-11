import { NextResponse } from 'next/server';
import { signedIn, sameOrigin } from '@/lib/auth';
import { saveBookOrder, validPublicId } from '@/lib/books';
import { readLimitedBody } from '@/lib/request-body';

export const runtime = 'nodejs';
export async function PUT(req: Request) {
  if (!await signedIn()) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (!await sameOrigin()) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  let input: unknown;
  try { input = JSON.parse(await readLimitedBody(req, 256 * 1024)); }
  catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const ids = input && typeof input === 'object' && 'ids' in input ? input.ids : null;
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && validPublicId(id))) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 });
  try {
    if (!await saveBookOrder(ids)) return NextResponse.json({ error: 'The flipbook list changed. Refresh the page and try again.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Could not save the order. Please try again.' }, { status: 500 }); }
}
