import 'server-only';
import { constants } from 'node:fs';
import { copyFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { bookDir, getBook, pdfFilename, withBookLock, writeBookMetadata } from '@/lib/books';
import { putPdf, deletePdf } from '@/lib/r2';

export async function replaceBookPdf(id: string, source: string, pages: number) {
  const initial = await getBook(id);
  if (!initial) return null;
  return withBookLock(initial.id, async () => {
    const book = await getBook(initial.id);
    if (!book) return null;
    const storageId = book.storageId || book.id;
    const previous = pdfFilename(book);
    const filename = `document-${randomUUID()}.pdf`;
    const target = path.join(bookDir(storageId), filename);
    const remote = book.pdfStorage === 'r2';
    let staged = false;
    try {
      if (remote) await putPdf(storageId, source, filename);
      else await copyFile(source, target, constants.COPYFILE_EXCL);
      staged = true;
      const updated = { ...book, pages, pdfFile: filename };
      await writeBookMetadata(updated);
      staged = false;
      try {
        if (remote) await deletePdf(storageId, previous);
        else await unlink(path.join(bookDir(storageId), previous));
      } catch (error) { console.error('Could not remove previous PDF after replacement:', error); }
      return updated;
    } finally {
      if (staged) {
        try { if (remote) await deletePdf(storageId, filename); else await unlink(target); }
        catch (error) { console.error('Could not remove staged replacement PDF:', error); }
      }
    }
  });
}
