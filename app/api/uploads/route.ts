import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { signedIn, sameOrigin } from '@/lib/auth';
import { root, getBook, validId } from '@/lib/books';
import { storageDriver } from '@/lib/r2';
import { readLimitedBody } from '@/lib/request-body';
import { safePdfName } from '@/lib/pdf-name';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!await signedIn() || !await sameOrigin()) return NextResponse.json({ error: 'Sign in and try again.' }, { status: 403 });
  let input: unknown;
  try { input = JSON.parse(await readLimitedBody(req, 4096)); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    const { title, size, replaceId, filename } = input as { title?: unknown; size?: unknown; replaceId?: unknown; filename?: unknown };
    const pdfName = filename === undefined ? undefined : safePdfName(filename);
    if (filename !== undefined && !pdfName) return NextResponse.json({ error: 'Enter a valid PDF filename.' }, { status: 400 });
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > 300 * 1024 * 1024) return NextResponse.json({ error: 'Select a PDF up to 300 MB.' }, { status: 400 });
    if (replaceId !== undefined && (typeof replaceId !== 'string' || !validId(replaceId))) return NextResponse.json({ error: 'Flipbook not found.' }, { status: 404 });
    const existing = replaceId ? await getBook(replaceId) : null;
    if (replaceId && !existing) return NextResponse.json({ error: 'Flipbook not found.' }, { status: 404 });
    if (!existing && (typeof title !== 'string' || !title.trim() || title.trim().length > 160 || /[\u0000-\u001f\u007f]/.test(title))) return NextResponse.json({ error: 'Enter a title and select a PDF up to 300 MB.' }, { status: 400 });
    const driver = existing ? (existing.pdfStorage || 'local') : storageDriver();
    const id = randomUUID();
    const dir = path.join(root, 'uploads', id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'upload.json'), JSON.stringify({ title: existing ? existing.title : (title as string).trim(), size, driver, replaceId: existing?.id, filename: pdfName }), { flag: 'wx' });
    await writeFile(path.join(dir, 'document.pdf'), '', { flag: 'wx' });
    return NextResponse.json({ id }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Could not start upload. Check the server storage configuration.' }, { status: 500 }); }
}

