// Loads KEY=value pairs from .env.local (and .env.test.local when TEST_ENV=1) at the repo root.
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);

export function loadEnv() {
  const files = [process.env.TEST_ENV ? '.env.test.local' : null, '.env.local'].filter(Boolean);
  const env = { ...process.env };
  for (const file of files) {
    const url = new URL(file, root);
    if (!existsSync(url)) continue;
    for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local');
  return { url, anonKey, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY };
}
