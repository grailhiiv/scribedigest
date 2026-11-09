import { NextResponse } from 'next/server'; import { logout,sameOrigin } from '@/lib/auth';
export async function POST(req:Request){ if(!await sameOrigin()) return new Response('Forbidden',{status:403}); await logout(); return NextResponse.redirect(new URL('/login',req.url),303); }
