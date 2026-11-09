import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { writeFile } from 'node:fs/promises';
const rl = createInterface({ input: process.stdin, output: process.stdout });
const username = (await rl.question('Admin username: ')).trim();
const password = await rl.question('Admin password (at least 12 characters; input is visible): ');
rl.close();
if (!username || password.length < 12 || /[\r\n]/.test(username)) { console.error('A username and password of at least 12 characters are required.'); process.exit(1); }
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
const secret = randomBytes(32).toString('hex');
try { await writeFile('.env.local', `ADMIN_USERNAME=${JSON.stringify(username)}\nADMIN_PASSWORD_HASH=${salt}:${hash}\nSESSION_SECRET=${secret}\n`, { flag: 'wx', mode: 0o600 }); console.log('Created .env.local. Keep this file private and back it up.'); } catch (e) { console.error('Could not create .env.local; it may already exist.', e.message); process.exit(1); }
