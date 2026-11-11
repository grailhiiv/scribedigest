import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { bookDir, getBook, pdfFilename } from '@/lib/books';
import { getPdf } from '@/lib/r2';

export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await getBook(id);
  const disposition = new URL(req.url).searchParams.get('download') === '1' ? 'attachment' : 'inline';
  if (!book) return new Response('Not found', { status: 404 });
  if (book.pdfStorage === 'r2') {
    try {
      const range = req.headers.get('range') || undefined;
      if (range && !/^bytes=(\d*)-(\d*)$/.test(range)) return new Response('Invalid range', { status: 416 });
      const object = await getPdf(book.storageId || book.id, range, pdfFilename(book));
      if (!object.Body) throw new Error('Missing object body');
      const headers = new Headers({ 'Content-Type': 'application/pdf', 'Content-Disposition': disposition, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' });
      if (object.ContentLength !== undefined) {
        headers.set('Content-Length', String(object.ContentLength));
        headers.set('X-PDF-Content-Length', String(object.ContentLength));
      }
      if (object.ContentRange) headers.set('Content-Range', object.ContentRange);
      return new Response(object.Body.transformToWebStream() as ReadableStream, { status: object.ContentRange ? 206 : 200, headers });
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      return new Response(status === 416 ? 'Invalid range' : 'Could not load PDF', { status: status === 416 ? 416 : 502 });
    }
  }
  const file = path.join(bookDir(book.storageId || book.id), pdfFilename(book));
  let size: number;
  try { size = (await stat(file)).size; } catch { return new Response('Not found', { status: 404 }); }
  const headers = new Headers({ 'Content-Type': 'application/pdf', 'Content-Disposition': disposition, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' });
  let start = 0, end = size - 1;
  const range = req.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    if (!match[1]) { const suffix = Number(match[2]); start = Math.max(size - suffix, 0); }
    else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), size - 1); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  headers.set('Content-Length', String(end - start + 1));
  headers.set('X-PDF-Content-Length', String(end - start + 1));
  const stream = createReadStream(file, { start, end });
  req.signal.addEventListener('abort', () => stream.destroy(), { once: true });
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
}
