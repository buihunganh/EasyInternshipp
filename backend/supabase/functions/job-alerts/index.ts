// job-alerts (Phase 12, DFD 8.2): called daily at 08:00 (Vietnam) by the ei-job-alerts cron job.
// For each active alert that is due (instant/daily: every day, weekly: Mondays or 7 days since the last
// e-mail), sends a digest of job_alert_matches() and moves last_sent_at forward.
import { authorized, json, layout, sendEmail, serviceClient, SITE_URL } from '../_shared/email.ts';

const DAY = 86400000;
const money = (v: number | null) => v ? `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu` : '';

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!authorized(req)) return json({ error: 'unauthorized' }, 401);
  const db = serviceClient();
  const now = new Date();
  const monday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(now) === 'Mon';

  const { data: alerts, error } = await db.from('job_alerts')
    .select('id, student_id, name, frequency, last_sent_at, student:profiles!job_alerts_student_id_fkey(email, full_name, status)')
    .eq('is_active', true).limit(5000);
  if (error) return json({ error: error.message }, 500);

  const studentIds = [...new Set((alerts ?? []).map(a => a.student_id))];
  const { data: prefs } = studentIds.length
    ? await db.from('notification_preferences').select('user_id, email_job_alerts').in('user_id', studentIds)
    : { data: [] as { user_id: string; email_job_alerts: boolean }[] };
  const optedOut = new Set((prefs ?? []).filter(p => !p.email_job_alerts).map(p => p.user_id));

  const result = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  for (const alert of alerts ?? []) {
    result.checked++;
    const student = alert.student as unknown as { email: string | null; full_name: string; status: string } | null;
    const last = alert.last_sent_at ? new Date(alert.last_sent_at).getTime() : 0;
    // A few hours of slack so cron jitter never skips a day; weekly digests go out on Mondays
    const since = now.getTime() - last;
    const due = alert.frequency === 'weekly' ? since >= 6 * DAY && (monday || since >= 7 * DAY) : since >= 20 * 3600000;
    if (!due || !student?.email || student.status !== 'active' || optedOut.has(alert.student_id)) { result.skipped++; continue; }

    const { data: jobs, error: matchError } = await db.rpc('job_alert_matches', { p_alert: alert.id });
    if (matchError) { result.failed++; console.error('job-alerts match', alert.id, matchError.message); continue; }
    if (!jobs?.length) { result.skipped++; continue; }

    const top = jobs.slice(0, 10) as { id: string; title: string; city: string | null; stipend_min: number | null; stipend_max: number | null }[];
    const stipend = (min: number | null, max: number | null) => min && max ? `${money(min)}–${money(max)}` : money(min || max);
    const lines = top.map(j => ['• ' + j.title, j.city, stipend(j.stipend_min, j.stipend_max)].filter(Boolean).join(' – '));
    const title = `${jobs.length} việc làm mới cho "${alert.name}"`;
    const html = layout({
      preheader: top[0].title, title,
      paragraphs: [`Chào ${student.full_name || 'bạn'},`, 'Đây là các tin thực tập mới phù hợp với thông báo việc làm của bạn:', ...lines, ...(jobs.length > top.length ? [`… và ${jobs.length - top.length} tin khác.`] : [])],
      cta: { text: 'Xem việc làm', href: `${SITE_URL}/pages/job-detail/?id=${encodeURIComponent(top[0].id)}` },
      footer: 'Bạn nhận email này vì đã tạo thông báo việc làm trên Internships.io. Tạm dừng hoặc xóa trong Đơn ứng tuyển → Thông báo việc làm.',
    });
    try {
      await sendEmail(student.email, `${title} | Internships.io`, html, [title, ...lines, `${SITE_URL}/pages/applications/?tab=alerts`].join('\n'));
      await db.from('job_alerts').update({ last_sent_at: now.toISOString() }).eq('id', alert.id);
      result.sent++;
    } catch (e) {
      result.failed++;
      console.error('job-alerts send', alert.id, (e as Error).message);
    }
  }
  return json(result);
});
