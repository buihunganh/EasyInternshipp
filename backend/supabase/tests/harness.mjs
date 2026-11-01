// PGlite test harness: runs every migration + seed in an in-process Postgres (no Docker, no network)
// and gives tests helpers to act as a guest, a signed-in user, or the service role.
//
// The shim below recreates the small part of Supabase the migrations rely on:
//   roles anon / authenticated / service_role, auth.users + auth.uid(), storage.buckets/objects,
//   storage.foldername(), the `extensions` schema, and Supabase's default privileges
//   (new public tables are granted to anon/authenticated, so a migration that forgets to
//   revoke them is caught by the tests just like it would be exposed on the real project).
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const root = new URL('../', import.meta.url);

const SHIM = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null, owner uuid default auth.uid(), metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant all on storage.objects, storage.buckets to service_role;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

export async function createDb({ seed = true } = {}) {
  const db = await PGlite.create({ extensions: { unaccent, pg_trgm } });
  await db.exec(SHIM);
  const migrations = readdirSync(new URL('migrations/', root)).filter(f => f.endsWith('.sql')).sort();
  for (const file of migrations) {
    try {
      await db.exec(readFileSync(new URL(`migrations/${file}`, root), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  if (seed) await db.exec(readFileSync(new URL('seed.sql', root), 'utf8'));
  return wrap(db);
}

function wrap(db) {
  /** Run `fn(q)` inside a transaction as the given role/user. Rolls back on error and rethrows. */
  async function run(role, userId, fn) {
    return db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`,
        [userId ? JSON.stringify({ sub: userId, role }) : '']);
      const q = async (sql, params = []) => (await tx.query(sql, params)).rows;
      return fn(q);
    });
  }

  const api = {
    raw: db,
    /** Superuser query (bypasses RLS), for setup and assertions. */
    async sql(sql, params = []) { return (await db.query(sql, params)).rows; },
    async one(sql, params = []) { return (await db.query(sql, params)).rows[0]; },
    /** Act as a guest (anon role). */
    anon(fn) { return run('anon', null, fn); },
    /** Act as a signed-in user. */
    as(userId, fn) { return run('authenticated', userId, fn); },
    /** Shorthand: call one SQL statement as a user and return its rows. */
    async q(userId, sql, params = []) {
      return userId ? run('authenticated', userId, q => q(sql, params)) : run('anon', null, q => q(sql, params));
    },
    /** Shorthand: call an RPC as a user. `args` is an object of named parameters. */
    async rpc(userId, fn, args = {}) {
      const names = Object.keys(args);
      const sql = `select * from public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
      const rows = await api.q(userId, sql, names.map(n => toParam(args[n])));
      return rows;
    },
    /** Create an auth user (the sign-up trigger creates the profile). Returns its id. */
    async createUser({ email = `${randomUUID().slice(0, 8)}@example.com`, ...meta } = {}) {
      const id = randomUUID();
      await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify(meta)]);
      return id;
    },
    async makeAdmin(email) {
      const id = await api.createUser({ email, full_name: 'Admin' });
      await db.query(`update public.profiles set role = 'admin' where id = $1`, [id]);
      return id;
    },
    /** A verified company owned by a new employer. Returns { owner, company }. */
    async verifiedCompany(admin, name = `Cty ${randomUUID().slice(0, 6)}`) {
      const owner = await api.createUser({ role: 'employer', full_name: 'Recruiter' });
      const [{ create_company: company }] = await api.rpc(owner, 'create_company', { p_name: name, p_tax_code: taxCode() });
      await api.q(owner, `insert into public.company_documents (company_id, doc_type, file_path) values ($1, 'business_license', $2)`,
        [company, `${company}/gpkd.pdf`]);
      await api.rpc(owner, 'submit_company_verification', { p_company: company });
      await api.rpc(admin, 'review_company_verification', { p_company: company, p_decision: 'verified' });
      return { owner, company };
    },
    /** An approved, active job. Returns its id. */
    async activeJob(admin, owner, company, extra = {}) {
      const cols = { company_id: company, title: 'Thực tập sinh Frontend', description: 'Mô tả công việc '.repeat(5), ...extra };
      const keys = Object.keys(cols);
      const [{ id }] = await api.q(owner, `insert into public.jobs (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
        keys.map(k => toParam(cols[k])));
      await api.rpc(owner, 'submit_job', { p_job: id });
      await api.rpc(admin, 'moderate_job', { p_job: id, p_approve: true });
      return id;
    },
    /** A student with a default CV. Returns its id. */
    async studentWithCv(meta = {}) {
      const student = await api.createUser({ role: 'student', full_name: 'Sinh viên', ...meta });
      await api.q(student, `insert into public.cvs (title, content, is_default) values ('CV', '{"summary":"hi"}', true)`);
      return student;
    },
  };
  return api;
}

/** Arrays of plain values stay Postgres arrays; objects and arrays of objects become JSON (jsonb params). */
function toParam(value) {
  if (Array.isArray(value) && value.every(v => v === null || typeof v !== 'object')) {
    // Postgres array literal, so untyped parameters (e.g. enum[]) parse correctly
    return '{' + value.map(v => v === null ? 'NULL' : `"${String(v).replace(/["\\]/g, '\\$&')}"`).join(',') + '}';
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
  return value;
}

let taxCounter = 1000000000;
function taxCode() { return String(taxCounter++); }

/** Assert that `promise` rejects with a message matching `pattern`. */
export async function rejects(promise, pattern) {
  try {
    await promise;
  } catch (error) {
    if (pattern && !pattern.test(error.message)) throw new Error(`Expected error matching ${pattern}, got: ${error.message}`);
    return error;
  }
  throw new Error(`Expected rejection${pattern ? ` matching ${pattern}` : ''}, but it resolved`);
}
