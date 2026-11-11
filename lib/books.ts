import 'server-only';
import { mkdir, readFile, writeFile, rename, unlink, readdir, rm, link, stat } from 'node:fs/promises';
import { randomUUID, randomInt } from 'node:crypto';
import path from 'node:path';
import { getPdfSize } from '@/lib/r2';
import { sortBooksByOrder } from '@/lib/book-order';
import { validR2PdfName } from '@/lib/pdf-name';

export type Book = { id: string; title: string; pages: number; createdAt: string; pdfStorage?: 'local' | 'r2'; storageId?: string; pdfFile?: string; r2File?: string; pdfVersion?: string; fileSize?: number };
export const root = path.resolve(process.env.DATA_DIR || './data');
export const bookDir = (id: string) => path.join(root, 'books', id);
export const validPublicId = (id: string) => /^[1-9][0-9]{7}$/.test(id);
export const validLegacyId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
export const validId = (id: string) => validPublicId(id) || validLegacyId(id);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const exists = (error: unknown) => (error as NodeJS.ErrnoException).code === 'EEXIST';
const indexDir = path.join(root, 'book-ids');
export function pdfFilename(book: Book): string {
  if (book.pdfStorage === 'r2' && book.r2File !== undefined) {
    if (!validR2PdfName(book.r2File)) throw new Error('Invalid R2 PDF file name.');
    return book.r2File;
  }
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
  const present = books.filter((book): book is Book => book !== null);
  const withSizes = await Promise.all(present.map(async book => {
    if (Number.isSafeInteger(book.fileSize) && book.fileSize! > 0) return book;
    try {
      const filename = pdfFilename(book);
      const size = book.pdfStorage === 'r2' ? await getPdfSize(book.storageId || book.id, filename) : (await stat(path.join(bookDir(book.storageId || book.id), filename))).size;
      return typeof size === 'number' && Number.isSafeInteger(size) && size > 0 ? { ...book, fileSize: size } : book;
    } catch { return book; }
  }));
  const dated = withSizes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const order: unknown = JSON.parse(await readFile(path.join(root, 'book-order.json'), 'utf8'));
    return sortBooksByOrder(dated, Array.isArray(order) ? order : []);
  } catch (error) { if (missing(error) || error instanceof SyntaxError) return dated; throw error; }
}
export async function saveBookOrder(ids: string[]) {
  return withBookLock('book-order', async () => {
    const books = await listBooks();
    if (ids.length !== books.length || new Set(ids).size !== ids.length || ids.some(id => !books.some(book => book.id === id))) return false;
    await mkdir(root, { recursive: true });
    const temp = path.join(root, `book-order-${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(ids), { flag: 'wx' });
      await rename(temp, path.join(root, 'book-order.json'));
    } finally { await unlink(temp).catch(() => {}); }
    return true;
  });
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
