import 'server-only';
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { scryptSync, timingSafeEqual } from 'node:crypto';
const name = 'scribe_admin';
function secret() { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new Error('Run npm run setup to configure the admin account.'); return new TextEncoder().encode(s); }
export function configured() { return !!(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH && process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32); }
export function checkPassword(username:string,password:string) { if (!configured() || username !== process.env.ADMIN_USERNAME || password.length > 1024) return false; const [salt, hash] = process.env.ADMIN_PASSWORD_HASH!.split(':'); if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return false; return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex')); }
export async function signedIn() { try { const token=(await cookies()).get(name)?.value; if (!token) return false; const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256']}); return payload.sub === process.env.ADMIN_USERNAME; } catch { return false; } }
export async function login() { const token=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(process.env.ADMIN_USERNAME!).setIssuedAt().setExpirationTime('12h').sign(secret()); (await cookies()).set(name,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:43200}); }
export async function logout() { (await cookies()).delete(name); }
export async function sameOrigin() { const h=await headers(); const origin=h.get('origin'); const host=h.get('x-forwarded-host') || h.get('host'); if (!origin || !host) return false; try { return new URL(origin).host===host; } catch { return false; } }
