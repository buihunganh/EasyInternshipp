// notify-email (Phase 12): called by the notifications_email_hook trigger with { notification_id }.
// Reloads the notification with the service role, checks the user's notification_preferences and
// sends one e-mail through Resend. BR-19 / BR-30 / BR-43 (e-mail channel).
import { authorized, json, layout, sendEmail, serviceClient, siteLink } from '../_shared/email.ts';

/** Which preference switch covers each notification type (types not listed are never e-mailed). */
const PREFERENCE: Record<string, 'email_application_updates' | 'email_messages' | 'email_job_alerts' | 'email_community'> = {
  application_received: 'email_application_updates',
  application_status: 'email_application_updates',
  cv_viewed: 'email_application_updates',
  interview_invite: 'email_application_updates',
  interview_rsvp: 'email_application_updates',
  offer_received: 'email_application_updates',
  offer_response: 'email_application_updates',
  job_moderated: 'email_application_updates',
  company_verification: 'email_application_updates',
  student_verification: 'email_application_updates',
  account: 'email_application_updates',
  event: 'email_application_updates',
  message: 'email_messages',
  job_alert: 'email_job_alerts',
  report_update: 'email_community',
};
/** Defaults when the user never saved preferences (same as the table defaults). */
const DEFAULTS = { email_application_updates: true, email_messages: true, email_job_alerts: true, email_community: false };

const CTA: Record<string, string> = {
  interview_invite: 'Xác nhận lịch phỏng vấn', offer_received: 'Xem thư mời nhận việc', application_received: 'Xem hồ sơ ứng viên',
  message: 'Mở tin nhắn', job_moderated: 'Xem tin tuyển dụng', event: 'Xem sự kiện',
};

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!authorized(req)) return json({ error: 'unauthorized' }, 401);
  const { notification_id } = await req.json().catch(() => ({}));
  if (typeof notification_id !== 'string') return json({ error: 'notification_id required' }, 400);

  const db = serviceClient();
  const { data: n, error } = await db.from('notifications').select('id, user_id, type, title, body, link').eq('id', notification_id).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!n) return json({ skipped: 'not found' });

  const pref = PREFERENCE[n.type];
  if (!pref) return json({ skipped: `type ${n.type} is in-app only` });
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    db.from('profiles').select('email, full_name, status').eq('id', n.user_id).maybeSingle(),
    db.from('notification_preferences').select('email_application_updates, email_messages, email_job_alerts, email_community').eq('user_id', n.user_id).maybeSingle(),
  ]);
  if (!profile?.email || profile.status === 'deactivated') return json({ skipped: 'no deliverable address' });
  if (!(prefs ?? DEFAULTS)[pref]) return json({ skipped: `${pref} is off` });

  const href = siteLink(n.link);
  const greeting = profile.full_name ? `Chào ${profile.full_name},` : 'Chào bạn,';
  const html = layout({ preheader: n.body ?? n.title, title: n.title, paragraphs: [greeting, ...(n.body ? [n.body] : [])], cta: { text: CTA[n.type] ?? 'Xem chi tiết', href } });
  const text = [greeting, n.title, n.body, href].filter(Boolean).join('\n\n');
  try {
    const id = await sendEmail(profile.email, `${n.title} | Internships.io`, html, text);
    return json({ sent: id ?? true });
  } catch (e) {
    console.error('notify-email', n.id, (e as Error).message);
    return json({ error: (e as Error).message }, 502);
  }
});
