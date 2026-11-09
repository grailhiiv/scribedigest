import 'server-only';
import { mkdir, readFile, writeFile, rename, unlink, readdir, rm, link } from 'node:fs/promises';
import { randomUUID, randomInt } from 'node:crypto';
import path from 'node:path';

export type Book = { id: string; title: string; pages: number; createdAt: string; pdfStorage?: 'local' | 'r2'; storageId?: string; pdfFile?: string };
export const root = path.resolve(process.env.DATA_DIR || './data');
export const bookDir = (id: string) => path.join(root, 'books', id);
export const validPublicId = (id: string) => /^[1-9][0-9]{7}$/.test(id);
export const validLegacyId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
export const validId = (id: string) => validPublicId(id) || validLegacyId(id);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const exists = (error: unknown) => (error as NodeJS.ErrnoException).code === 'EEXIST';
const indexDir = path.join(root, 'book-ids');
export function pdfFilename(book: Book): string {
  if (!book.pdfFile) return 'document.pdf';
  if (!/^document-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/.test(book.pdfFile)) throw new Error('Invalid PDF file name.');
  return book.pdfFile;
}

const locks = (globalThis as typeof globalThis & { scribeBookLocks?: Map<string, Promise<void>> }).scribeBookLocks ??= new Map();
export async function withBookLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  locks.set(id, current);
  await previous;
  try { return await action(); } finally { if (locks.get(id) === current) locks.delete(id); release(); }
}
export async function writeBookMetadata(book: Book) {
  const storageId = book.storageId || book.id;
  const temp = path.join(bookDir(storageId), `book-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify({ ...book, id: storageId }), { flag: 'wx' });
    await rename(temp, path.join(bookDir(storageId), 'book.json'));
  } finally { await unlink(temp).catch(() => {}); }
}

// Index entries are retained after deletion so a previously shared URL is never reused.
async function reserveId(storageId?: string): Promise<string> {
  await mkdir(indexDir, { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = String(randomInt(10_000_000, 100_000_000));
    try { await writeFile(path.join(indexDir, id), storageId || id, { flag: 'wx' }); return id; }
    catch (error) { if (!exists(error)) throw error; }
  }
  throw new Error('Unable to allocate a book ID.');
}
export async function allocateBookId() { return reserveId(); }
async function legacyPublicId(id: string): Promise<string> {
  const target = path.join(bookDir(id), 'public-id');
  try { const existing = await readFile(target, 'utf8'); if (!validPublicId(existing)) throw new Error('Invalid book ID mapping.'); return existing; }
  catch (error) { if (!missing(error)) throw error; }
  const assigned = await reserveId(id);
  const temp = path.join(bookDir(id), `public-id-${randomUUID()}.tmp`);
  let published = false;
  try {
    await writeFile(temp, assigned, { flag: 'wx' });
    try { await link(temp, target); published = true; return assigned; }
    catch (error) { if (!exists(error)) throw error; const existing = await readFile(target, 'utf8'); if (!validPublicId(existing)) throw new Error('Invalid book ID mapping.'); return existing; }
  } finally {
    await unlink(temp).catch(() => {});
    if (!published) await unlink(path.join(indexDir, assigned)).catch(() => {});
  }
}

export async function listBooks(): Promise<Book[]> {
  let ids: string[];
  try { ids = await readdir(path.join(root, 'books')); }
  catch (error) { if (missing(error)) return []; throw error; }
  const books = await Promise.all(ids.filter(validId).map(getBook));
  return books.filter((book): book is Book => book !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getBook(id: string): Promise<Book | null> {
  if (!validId(id)) return null;
  try {
    const storageId = validPublicId(id) ? await readFile(path.join(indexDir, id), 'utf8') : id;
    if (!validId(storageId)) throw new Error('Invalid book storage mapping.');
    const book = JSON.parse(await readFile(path.join(bookDir(storageId), 'book.json'), 'utf8')) as Book;
    const publicId = validLegacyId(storageId) ? await legacyPublicId(storageId) : storageId;
    if (validPublicId(id) && publicId !== id) return null;
    return { ...book, id: publicId, storageId };
  }
  catch (error) { if (missing(error)) return null; throw error; }
}
export async function saveBook(book: Book, data: Uint8Array) {
  const dir = bookDir(book.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'document.pdf'), data, { flag: 'wx' });
  await writeFile(path.join(dir, 'book.tmp'), JSON.stringify(book), { flag: 'wx' });
  await rename(path.join(dir, 'book.tmp'), path.join(dir, 'book.json'));
}
export async function saveRemoteBook(book: Book) {
  const dir = bookDir(book.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'book.json'), JSON.stringify(book), { flag: 'wx' });
}
export async function removeBookDirectory(id: string) {
  if (!validId(id)) throw new Error('Invalid book ID');
  await rm(bookDir(id), { recursive: true, force: true });
}
export async function renameBook(id: string, title: string): Promise<Book | null> {
  const book = await getBook(id);
  if (!book) return null;
  const updated = { ...book, title };
  await writeBookMetadata(updated);
  return updated;
}
