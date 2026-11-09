import { NextResponse } from 'next/server';
import { appendFile, open, readFile, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { signedIn, sameOrigin } from '@/lib/auth';
import { root, validId, saveBook, saveRemoteBook, allocateBookId } from '@/lib/books';
import { putPdf, deletePdf } from '@/lib/r2';
import { replaceBookPdf } from '@/lib/replace-book';
export const runtime = 'nodejs';
const chunkLimit = 8 * 1024 * 1024;
async function authorized() { return await signedIn() && await sameOrigin(); }
async function load(id: string) {
  if (!validId(id)) throw new Error('Invalid ID');
  const dir = path.join(root, 'uploads', id);
  const info = JSON.parse(await readFile(path.join(dir, 'upload.json'), 'utf8')) as { title: string; size: number; driver: 'r2' | 'local'; replaceId?: string };
  return { dir, info, file: path.join(dir, 'document.pdf') };
}
async function lock(dir: string) { return open(path.join(dir, 'lock'), 'wx'); }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return NextResponse.json({ error: 'Sign in and try again.' }, { status: 403 });
  const { id } = await params;
  try {
    const { dir, info, file } = await load(id);
    const handle = await lock(dir);
    try {
      const offset = Number(req.headers.get('x-upload-offset'));
      const length = Number(req.headers.get('content-length'));
      const current = (await stat(file)).size;
      if (!Number.isSafeInteger(offset) || offset !== current || !Number.isSafeInteger(length) || length <= 0 || length > chunkLimit || current + length > info.size) return NextResponse.json({ error: 'Invalid upload chunk.' }, { status: 400 });
      const reader = req.body?.getReader();
      if (!reader) return NextResponse.json({ error: 'Missing upload chunk.' }, { status: 400 });
      const chunks: Uint8Array[] = []; let received = 0;
      while (true) { const { value, done } = await reader.read(); if (done) break; received += value.length; if (received > length || received > chunkLimit) { await reader.cancel(); return NextResponse.json({ error: 'Invalid upload chunk.' }, { status: 400 }); } chunks.push(value); }
      if (received !== length) return NextResponse.json({ error: 'Incomplete upload chunk.' }, { status: 400 });
      await appendFile(file, Buffer.concat(chunks));
      return NextResponse.json({ received: current + received });
    } finally { await handle.close(); await unlink(path.join(dir, 'lock')).catch(() => {}); }
  } catch { return NextResponse.json({ error: 'Could not save upload chunk.' }, { status: 500 }); }
}
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return NextResponse.json({ error: 'Sign in and try again.' }, { status: 403 });
  const { id } = await params;
  try {
    const { dir, info, file } = await load(id);
    const handle = await lock(dir);
    try {
      if ((await stat(file)).size !== info.size) return NextResponse.json({ error: 'Upload is incomplete.' }, { status: 400 });
      const bytes = await readFile(file);
      let pages: number;
      try {
        if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF');
        pages = (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
        if (!pages) throw new Error('Empty PDF');
      } catch { return NextResponse.json({ error: 'This PDF could not be read. Please use a valid, unlocked PDF.' }, { status: 400 }); }
      let book;
      if (info.replaceId) {
        book = await replaceBookPdf(info.replaceId, file, pages);
        if (!book) return NextResponse.json({ error: 'Flipbook no longer exists.' }, { status: 404 });
      } else {
        book = { id: await allocateBookId(), title: info.title, pages, createdAt: new Date().toISOString(), pdfStorage: info.driver };
        if (info.driver === 'r2') {
          await putPdf(book.id, file);
          try { await saveRemoteBook(book); } catch (error) { await deletePdf(book.id).catch(() => {}); throw error; }
        } else await saveBook(book, bytes);
      }
      await handle.close();
      await rm(dir, { recursive: true, force: true }).catch(error => console.error('Could not remove completed upload:', error));
      return NextResponse.json({ book }, { status: info.replaceId ? 200 : 201 });
    } finally { await handle.close().catch(() => {}); await unlink(path.join(dir, 'lock')).catch(() => {}); }
  } catch { return NextResponse.json({ error: 'Could not save the PDF. Check the server storage and try again.' }, { status: 500 }); }
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return NextResponse.json({ error: 'Sign in and try again.' }, { status: 403 });
  const { id } = await params;
  try { const { dir } = await load(id); const handle = await lock(dir); await handle.close(); await rm(dir, { recursive: true, force: true }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: 'Could not discard upload.' }, { status: 500 }); }
}
