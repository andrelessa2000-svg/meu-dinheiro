import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
const envPath = path.join(process.cwd(), '.env');
let url = '';
try {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((l) => {
    if (l.startsWith('DATABASE_URL=')) {
      url = l.slice(13).trim();
    }
  });
} catch (e) {}
if (!url) {
  console.log('0');
  process.exit(0);
}
const sql = neon(url);
const r = await sql`DELETE FROM users WHERE username IN ('neon_alice','neon_bob','carol') RETURNING id`;
console.log(r.length);
