import {redirect} from 'next/navigation'; import {signedIn} from '@/lib/auth'; import {listBooks} from '@/lib/books'; import Dashboard from './dashboard';
export const dynamic='force-dynamic';
export default async function Admin(){if(!await signedIn()) redirect('/login'); return <Dashboard books={await listBooks()}/>;}
