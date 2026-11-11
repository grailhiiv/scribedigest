import 'server-only';
import { constants } from 'node:fs';
import { copyFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { bookDir, getBook, pdfFilename, withBookLock, writeBookMetadata } from '@/lib/books';
import { putPdf, deletePdf, pdfExists } from '@/lib/r2';
import { suffixedPdfName, validR2PdfName } from '@/lib/pdf-name';

export async function replaceBookPdf(id: string, source: string, pages: number, fileSize: number, originalFilename?: string) {
  const initial = await getBook(id);
  if (!initial) return null;
  return withBookLock(initial.id, async () => {
    const book = await getBook(initial.id);
    if (!book) return null;
    const storageId = book.storageId || book.id;
    const previous = pdfFilename(book);
    const remote = book.pdfStorage === 'r2';
    if (originalFilename !== undefined && !validR2PdfName(originalFilename)) throw new Error('Invalid PDF file name.');
    let filename = `document-${randomUUID()}.pdf`;
    if (remote && originalFilename) {
      filename = originalFilename;
      if (filename === previous || await pdfExists(storageId, filename)) filename = suffixedPdfName(filename, randomUUID());
    }
    const target = path.join(bookDir(storageId), filename);
    let staged = false;
    try {
      if (remote) await putPdf(storageId, source, filename);
      else await copyFile(source, target, constants.COPYFILE_EXCL);
      staged = true;
      const updated = { ...book, pages, fileSize, pdfFile: remote && originalFilename ? undefined : filename,
        r2File: remote && originalFilename ? filename : undefined, pdfVersion: randomUUID() };
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
