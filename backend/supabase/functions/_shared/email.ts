// Shared helpers for the e-mail Edge Functions (Phase 12, decision D5: Resend).
// Env (supabase secrets set …): RESEND_API_KEY, EMAIL_FROM ("Internships.io <noreply@your-domain>"),
// SITE_URL (https://your-site), EI_WEBHOOK_SECRET (same value as the Vault secret ei_webhook_secret).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the Edge runtime.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

export const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:5173').replace(/\/$/, '');

export function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** Constant-time check of the x-webhook-secret header sent by private.call_edge_function(). */
export function authorized(req: Request) {
  const expected = Deno.env.get('EI_WEBHOOK_SECRET') ?? '';
  const given = req.headers.get('x-webhook-secret') ?? '';
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Absolute link on the site for a notification's relative link ("/pages/applications/?id=…"). */
export const siteLink = (link: string | null | undefined) => !link ? SITE_URL : /^https?:\/\//.test(link) ? link : `${SITE_URL}${link.startsWith('/') ? '' : '/'}${link}`;

/** Simple, client-safe layout (inline styles, one column, 560px) in the site's "paper & ink" palette. */
export function layout(opts: { preheader: string; title: string; paragraphs: string[]; cta?: { text: string; href: string }; footer?: string }) {
  const p = opts.paragraphs.map(t => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#2b2a27">${escapeHtml(t)}</p>`).join('');
  const cta = opts.cta ? `<p style="margin:20px 0 4px"><a href="${escapeHtml(opts.cta.href)}" style="display:inline-block;background:#b5361c;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:8px">${escapeHtml(opts.cta.text)}</a></p>` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;background:#f4f1ea;font-family:Inter,Segoe UI,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 20px;font-weight:700;font-size:16px;color:#b5361c">Internships.io</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#1d1c1a">${escapeHtml(opts.title)}</h1>
${p}${cta}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e6e1d6;font-size:12px;line-height:1.5;color:#7a766d">${escapeHtml(opts.footer ?? 'Bạn nhận email này vì đã bật thông báo qua email trên Internships.io. Tắt trong menu Tôi → Cài đặt thông báo.')}</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** Send through Resend. Returns the provider id, or throws with the provider's message. */
export async function sendEmail(to: string, subject: string, html: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') ?? 'Internships.io <onboarding@resend.dev>', to: [to], subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message ?? 'error'}`);
  return body?.id as string | undefined;
}
