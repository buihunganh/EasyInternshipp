// The single Supabase client. Only modules' api.ts files (and core/session.ts) import it.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
export type { Database };

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env.local');

export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Views<T extends keyof Database['public']['Views']> = Database['public']['Views'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
export type RpcReturn<T extends keyof Database['public']['Functions']> = Database['public']['Functions'][T]['Returns'];

/** Public URL of an object in a public bucket (avatars, company-assets, post-attachments). */
export function publicUrl(bucket: string, path: string | null | undefined) {
  return path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : '';
}

/** Signed URL (60 minutes) for a private bucket object. */
export async function signedUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
