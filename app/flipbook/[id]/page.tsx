import {notFound, redirect} from 'next/navigation'; import {getBook} from '@/lib/books';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const book=await getBook(id);if(!book)notFound();redirect(`/${book.id}`);}
