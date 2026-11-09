import { notFound } from 'next/navigation';
import { getBook, validPublicId } from '@/lib/books';
import Reader from '../flipbook/[id]/reader';

export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validPublicId(id)) notFound();
  const book = await getBook(id);
  if (!book) notFound();
  return <Reader book={book} />;
}
