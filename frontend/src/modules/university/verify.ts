// Public internship certificate check (/pages/verify/?code=): verify_internship_certificate is callable by anyone
// and only returns certified reports. The QR code points back to this page so a printed copy can be checked.
import { el, showState } from '../../core/render';
import { toAppError } from '../../core/errors';
import { formatDate } from '../../core/format';
import { verifyCertificate } from './api';

export function setupVerifyPage() {
  const form = document.getElementById('verify-form') as HTMLFormElement;
  const input = document.getElementById('verify-code') as HTMLInputElement;
  const result = document.getElementById('verify-result')!;
  const code = new URLSearchParams(location.search).get('code')?.trim() || '';
  input.value = code;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const next = input.value.trim().toUpperCase();
    if (!next) { input.focus(); return; }
    const url = new URL(location.href);
    url.searchParams.set('code', next);
    history.replaceState(null, '', url);
    check(next);
  });
  if (code) check(code.toUpperCase());

  async function check(value: string) {
    if (!/^[A-Z0-9]{6,20}$/.test(value)) { showState(result, 'error', 'Mã chứng nhận gồm 6–20 ký tự chữ và số.'); return; }
    result.hidden = false;
    showState(result, 'loading', 'Đang tra cứu chứng nhận...');
    try {
      const cert = await verifyCertificate(value);
      if (!cert) {
        result.replaceChildren(el('div', { className: 'verify-status verify-status--bad', role: 'alert' },
          el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'gpp_bad'),
          el('div', {}, el('strong', {}, 'Không tìm thấy chứng nhận hợp lệ'), el('p', {}, `Mã ${value} không tồn tại hoặc chưa được nhà trường chứng thực.`))));
        return;
      }
      const link = `${location.origin}/pages/verify/?code=${encodeURIComponent(value)}`;
      const qr = el('img', { className: 'verify-qr', alt: `Mã QR tra cứu chứng nhận ${value}`, width: 132, height: 132 });
      // Loaded on demand so the QR library stays out of the bundle every other page loads
      import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(link, { margin: 1, width: 264, errorCorrectionLevel: 'M' }))
        .then(url => { qr.src = url; }).catch(() => qr.remove());
      const row = (label: string, text: string | null | undefined) => text ? el('div', { className: 'verify-field' }, el('dt', {}, label), el('dd', {}, text)) : null;
      const print = el('button', { type: 'button', className: 'ui-btn ui-btn--neutral ui-btn--sm verify-print' },
        el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'print'), 'In chứng nhận');
      print.dataset.appControl = 'verify';
      print.addEventListener('click', () => window.print());
      result.replaceChildren(
        el('div', { className: 'verify-status verify-status--ok', role: 'status' },
          el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'verified'),
          el('div', {}, el('strong', {}, 'Chứng nhận hợp lệ'), el('p', {}, `Được nhà trường chứng thực ngày ${formatDate(cert.certified_at)}.`))),
        el('article', { className: 'verify-cert' },
          el('header', { className: 'verify-cert__head' },
            el('div', {}, el('span', { className: 'verify-eyebrow' }, 'Internships.io · Chứng nhận thực tập'), el('h2', {}, cert.student_name),
              el('p', {}, [cert.student_code && `MSSV ${cert.student_code}`, cert.university].filter(Boolean).join(' · '))),
            qr),
          el('dl', { className: 'verify-fields' },
            row('Vị trí thực tập', cert.job_title),
            row('Doanh nghiệp', cert.company),
            row('Bắt đầu', cert.hired_at ? formatDate(cert.hired_at) : null),
            row('Đánh giá của doanh nghiệp', cert.employer_rating ? `${'★'.repeat(cert.employer_rating)}${'☆'.repeat(5 - cert.employer_rating)} (${cert.employer_rating}/5)` : null),
            row('Ngày chứng thực', formatDate(cert.certified_at)),
            row('Mã chứng nhận', value)),
          el('p', { className: 'verify-foot' }, `Quét mã QR hoặc truy cập ${link} để kiểm tra tính xác thực.`)),
        print);
    } catch (error) {
      showState(result, 'error', toAppError(error).message, () => check(value));
    }
  }
}
