import { NextResponse } from 'next/server';
import { signedIn, sameOrigin } from '@/lib/auth';
import { renameBook, validId, getBook, removeBookDirectory, withBookLock, pdfFilename } from '@/lib/books';
import { deletePdf } from '@/lib/r2';
import { readLimitedBody } from '@/lib/request-body';

export const runtime = 'nodejs';
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await signedIn()) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (!await sameOrigin()) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: 'Flipbook not found.' }, { status: 404 });
  let input: unknown;
  try { input = JSON.parse(await readLimitedBody(req, 4096)); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const title = input && typeof input === 'object' && 'title' in input && typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 160 || /[\u0000-\u001f\u007f]/.test(title)) return NextResponse.json({ error: 'Enter a title of up to 160 characters.' }, { status: 400 });
  try {
    const existing = await getBook(id);
    if (!existing) return NextResponse.json({ error: 'Flipbook not found.' }, { status: 404 });
    const book = await withBookLock(existing.id, () => renameBook(existing.id, title));
    if (!book) return NextResponse.json({ error: 'Flipbook not found.' }, { status: 404 });
    return NextResponse.json({ book });
  } catch { return NextResponse.json({ error: 'Could not save the title. Please try again.' }, { status: 500 }); }
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await signedIn()) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (!await sameOrigin()) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  const { id } = await params;
  try {
    const initial = await getBook(id);
    if (!initial) return NextResponse.json({ error: 'Flipbook not found.' }, { status: 404 });
    const removed = await withBookLock(initial.id, async () => {
      const book = await getBook(initial.id);
      if (!book) return false;
      if (book.pdfStorage === 'r2') await deletePdf(book.storageId || book.id, pdfFilename(book));
      await removeBookDirectory(book.storageId || book.id);
      return true;
    });
    if (!removed) return NextResponse.json({ error: 'Flipbook not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Could not delete the flipbook. Please try again.' }, { status: 500 }); }
}
