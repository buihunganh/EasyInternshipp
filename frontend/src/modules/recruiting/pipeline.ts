// Candidate board (Phase 7): real ATS pipeline, Kanban columns from pipeline_stages,
// applicant drawer with CV preview, screening answers, status history, interview scheduling,
// scorecards, offers, talent search, and CSV export.
import { flash } from '../../core/auth';
import { label, routes } from '../../core/navigation';
import { dialog, toast } from '../../core/ui/feedback';
import { bind, csv, esc, field, value } from '../../core/ui/actions';
import { showError } from '../../core/errors';
import {
  applicationStatusLabel, formatDate, formatDateTime, formatVnd, localDateTimeInput, relativeTime, rsvpStatusLabel
} from '../../core/format';
import { el, stateBlock } from '../../core/render';
import { initialsAvatar } from '../../core/layout/siteHeader';
import { publicUrl } from '../../core/supabase';
import type { CvContent } from '../../core/models';
import {
  companyJobs, createPipelineStage, cvSignedUrl, getApplicationDetail, getJobApplications,
  getPipelineStages, markApplicationViewed, moveApplicationStage, myCompany,
  rateIntern, saveEvaluation, scheduleInterview, searchCandidates, sendOffer,
  startConversation, updateApplicationStatus, updateInterview, updatePipelineStage,
  uploadOfferLetter, withdrawOffer, type ApplicationDetail, type DashboardJob,
  type JobApplication, type MyCompany, type PipelineStage, sendTextMessage } from './api';

const DEFAULT_STAGES = ['Hồ sơ mới nộp', 'Sàng lọc & Test', 'Phỏng vấn', 'Đã gửi thư mời', 'Đã nhận việc'];

export async function setupCandidates() {
  // The design's sample KPIs (86 / 32 / 8 / 3) and "Cập nhật 15 phút trước bởi Mai Phương" must never show
  document.querySelectorAll('.candidate-metrics > div .my-sm > span').forEach(span => { span.textContent = '–'; });
  const updatedLine = [...document.querySelectorAll<HTMLElement>('main span')].find(sp => /^Cập nhật .* trước bởi/.test(sp.textContent?.trim() || ''));
  if (updatedLine) updatedLine.textContent = '';
  const company = await myCompany().catch(error => { showError(error); return null; });
  if (!company) {
    flash('Hãy tạo hồ sơ doanh nghiệp trước khi truy cập quản lý ứng viên.');
    location.replace(routes['company-settings']);
    return;
  }
  const activeCompany = company;

  const jobs = await companyJobs(company.id).catch(err => { showError(err); return []; });
  if (!jobs.length) {
    const main = document.querySelector('main');
    if (main) {
      main.replaceChildren(el('div', { className: 'candidate-workspace flex flex-col w-full px-gutter py-md gap-lg' },
        el('div', { className: 'app-state' },
          el('h2', {}, 'Chưa có tin tuyển dụng nào'),
          el('p', {}, 'Bạn cần đăng tin tuyển dụng trước khi quản lý ứng viên.'),
          el('a', { className: 'ei-button ei-button-primary', href: routes['post-job'] }, 'Đăng tin tuyển dụng ngay')
        )
      ));
    }
    return;
  }

  // Determine active job from query param or first job
  const params = new URLSearchParams(location.search);
  const requestedJobId = params.get('job');
  let currentJob: DashboardJob = jobs.find(j => j.id === requestedJobId) || jobs.find(j => j.status === 'active') || jobs[0];

  const jobBtn = document.getElementById('jobSelectorBtn') as HTMLButtonElement | null;
  const boardEl = document.querySelector('.candidate-board') as HTMLElement | null;
  const drawerEl = document.getElementById('candidateDrawer') as HTMLElement | null;
  const filterSelects = [...document.querySelectorAll<HTMLSelectElement>('.candidate-filters select')];
  // The design export pre-selects sample filters (match > 90%, ĐH Bách Khoa, Năm 4…); start from "all" so no applicant is hidden
  filterSelects.forEach(sel => { sel.querySelectorAll('option').forEach(o => o.removeAttribute('selected')); sel.selectedIndex = 0; });
  const resetFiltersBtn = document.querySelector('.candidate-filters [class*="cursor-pointer"]') as HTMLElement | null;

  // Clone column and card templates from initial static HTML
  const colTemplate = boardEl?.firstElementChild?.cloneNode(true) as HTMLElement | null;
  let cardTemplate: HTMLElement | null = null;
  if (colTemplate) {
    cardTemplate = (colTemplate.querySelector('.bg-surface-container-lowest') ?? colTemplate.children[1])?.cloneNode(true) as HTMLElement | null;
  }

  let stages: PipelineStage[] = [];
  let applications: JobApplication[] = [];
  let selectedAppId: string | null = null;

  function renderJobSelector() {
    if (!jobBtn) return;
    const spans = jobBtn.querySelectorAll('span');
    if (spans.length >= 3) {
      spans[1].textContent = currentJob.title;
      spans[2].textContent = currentJob.department || (currentJob.city ?? '');
    } else {
      jobBtn.textContent = currentJob.title;
    }
    bind(jobBtn, () => {
      dialog('Chọn vị trí tuyển dụng', `
        <label>Vị trí tuyển dụng
          <select name="job_id">
            ${jobs.map(j => `<option value="${j.id}" ${j.id === currentJob.id ? 'selected' : ''}>${esc(j.title)} (${j.application_count} hồ sơ)</option>`).join('')}
          </select>
        </label>
      `, 'Xem ứng viên', form => {
        const picked = value(form, 'job_id');
        if (picked && picked !== currentJob.id) {
          const target = jobs.find(j => j.id === picked);
          if (target) {
            currentJob = target;
            const u = new URL(location.href);
            u.searchParams.set('job', currentJob.id);
            history.pushState(null, '', u.toString());
            renderJobSelector();
            void load();
          }
        }
      });
    });
  }

  async function ensureDefaultStages(jobId: string) {
    let list = await getPipelineStages(jobId);
    if (!list.length) {
      for (const [idx, name] of DEFAULT_STAGES.entries()) {
        await createPipelineStage(jobId, name, idx);
      }
      list = await getPipelineStages(jobId);
    }
    return list;
  }

  function renderKpiMetrics() {
    const cards = document.querySelectorAll('.candidate-metrics > div');
    if (!cards.length) return;
    const total = applications.length;
    const potential = applications.filter(a => (a.match_score ?? 0) >= 80).length;
    const interviewing = applications.filter(a => a.status === 'interviewing').length;
    const offered = applications.filter(a => a.status === 'offered').length;

    const values = [
      { num: String(total), label: `${total} hồ sơ` },
      { num: String(potential), label: `${total ? Math.round((potential / total) * 100) : 0}% tổng số nộp` },
      { num: String(interviewing), label: `${interviewing} ứng viên` },
      { num: String(offered), label: `${offered} chờ phản hồi` },
    ];

    cards.forEach((card, idx) => {
      const v = values[idx];
      if (!v) return;
      const numEl = card.querySelector('.my-sm > span:first-child');
      if (numEl) numEl.textContent = v.num;
      const subEl = card.querySelector('.my-sm > span:last-child');
      if (subEl) subEl.textContent = v.label;
    });
  }

  function getFilteredApplications() {
    return applications.filter(app => {
      // 0: AI Match Score
      const matchIdx = filterSelects[0]?.selectedIndex ?? 0;
      const score = app.match_score ?? 0;
      if (matchIdx === 1 && score < 90) return false;
      if (matchIdx === 2 && score < 80) return false;
      if (matchIdx === 3 && (score < 60 || score > 80)) return false;

      // 1: University
      const uniVal = filterSelects[1]?.value;
      if (uniVal && filterSelects[1]?.selectedIndex > 0) {
        const studentUni = app.student?.student_profile?.university?.name || '';
        if (!studentUni.toLowerCase().includes(uniVal.toLowerCase().replace('đh ', '').replace('đại học ', ''))) return false;
      }

      // 2: Study Year
      const yearIdx = filterSelects[2]?.selectedIndex ?? 0;
      // Study year is derived from the graduation year (final-year students graduate this academic year)
      const gradYear = app.student?.student_profile?.graduation_year ?? null;
      const now = new Date();
      const finalYear = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
      if (yearIdx === 1 && gradYear !== finalYear + 1) return false;
      if (yearIdx === 2 && gradYear !== finalYear) return false;
      if (yearIdx === 3 && (gradYear === null || gradYear >= finalYear)) return false;

      // 3: Tech Stack / Skills
      const skillVal = filterSelects[3]?.value;
      if (skillVal && filterSelects[3]?.selectedIndex > 0) {
        const searchTerms = skillVal.toLowerCase().split(/[,\s/]+/);
        const headline = (app.student?.student_profile?.headline || '').toLowerCase();
        const major = (app.student?.student_profile?.major || '').toLowerCase();
        const matched = searchTerms.some(term => headline.includes(term) || major.includes(term));
        if (!matched) return false;
      }

      // 4: GPA
      const gpaIdx = filterSelects[4]?.selectedIndex ?? 0;
      const gpa = app.student?.student_profile?.gpa ?? 0;
      if (gpaIdx === 1 && gpa < 3.0) return false;
      if (gpaIdx === 2 && gpa < 3.2) return false;
      if (gpaIdx === 3 && gpa < 3.6) return false;

      return true;
    });
  }

  function cardElement(app: JobApplication) {
    if (!cardTemplate) return el('div', {}, app.id);
    const c = cardTemplate.cloneNode(true) as HTMLElement;
    c.dataset.applicationId = app.id;
    c.dataset.demoCard = app.id; // Compatibility for test scripts
    c.tabIndex = 0;
    c.style.cursor = 'pointer';

    const name = app.student?.full_name || app.student?.email || 'Ứng viên';
    const profile = app.student?.student_profile;
    const uniName = profile?.university?.short_name || profile?.university?.name || 'Chưa cập nhật trường';
    const gpa = profile?.gpa != null ? `GPA: ${profile.gpa.toFixed(1)}/4.0` : 'Chưa có GPA';
    const yearText = profile?.study_year ? `Năm ${profile.study_year}` : (profile?.graduation_year ? `Khóa ${profile.graduation_year}` : 'Sinh viên');

    // Avatar & Name
    const avatarImg = c.querySelector('img') as HTMLImageElement | null;
    if (avatarImg) {
      avatarImg.src = publicUrl('avatars', app.student?.avatar_path) || initialsAvatar(name);
      avatarImg.alt = name;
    }
    const nameEl = c.querySelector('.font-headline-md') as HTMLElement | null;
    if (nameEl) nameEl.textContent = name;
    const schoolEl = nameEl?.nextElementSibling as HTMLElement | null;
    if (schoolEl) schoolEl.textContent = uniName;

    // Match score chip
    const matchEl = c.querySelector('.font-label-sm.font-bold, .font-label-sm.font-medium, [class*="Match"]') as HTMLElement | null;
    if (matchEl) {
      matchEl.textContent = app.match_score != null ? `${app.match_score}% Match` : 'Chưa có % phù hợp';
    }

    // Skills (from the CV submitted with the application) instead of the design's sample chips
    const snapshot = app.cv_snapshot as unknown as Partial<CvContent> | null;
    const skillRow = c.querySelector<HTMLElement>('.flex.flex-wrap.gap-1');
    const skillChip = skillRow?.firstElementChild;
    if (skillRow && skillChip) {
      const skills = (snapshot?.skills ?? []).filter(Boolean).slice(0, 4);
      skillRow.replaceChildren(...skills.map(sk => { const chip = skillChip.cloneNode(true) as HTMLElement; chip.textContent = sk; return chip; }));
      skillRow.hidden = !skills.length;
    }

    // CV row: an uploaded PDF or the online CV, never the design's sample file name
    const cvName = [...c.querySelectorAll<HTMLElement>('span.truncate')].find(sp => /\.pdf$|CV/i.test(sp.textContent || ''));
    if (cvName) {
      cvName.textContent = app.cv_file_path ? (app.cv_file_path.split('/').pop() || 'CV đính kèm.pdf') : 'CV trực tuyến';
      const icon = cvName.previousElementSibling;
      if (icon && !app.cv_file_path) icon.textContent = 'description';
    }

    // GPA & Year
    const metaRow = c.querySelector('.flex.items-center.gap-sm.text-label-sm') as HTMLElement | null;
    if (metaRow) {
      const gpaSpan = metaRow.querySelector('span:first-child') as HTMLElement | null;
      if (gpaSpan) gpaSpan.textContent = gpa;
      const yearSpan = metaRow.lastElementChild as HTMLElement | null;
      if (yearSpan) yearSpan.textContent = yearText;
    }

    // Knockout alert
    if (app.knockout_passed === false) {
      const koBadge = el('div', { className: 'ei-chip ei-chip-rejected', style: 'font-size:11px; margin-top:4px;' } as never, 'Knockout: Không đạt');
      const headerBox = c.firstElementChild;
      if (headerBox) headerBox.after(koBadge);
    }

    // Card click -> Open Drawer
    c.addEventListener('click', e => {
      if ((e.target as Element).closest('button, a, input, select')) return;
      void openDrawer(app.id);
    });
    c.addEventListener('keydown', e => {
      if (e.key === 'Enter') void openDrawer(app.id);
    });

    // Action buttons inside card
    c.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
      const text = label(b);
      if (/Xem CV|Chi tiết/.test(text)) {
        bind(b, () => void openDrawer(app.id));
      } else if (/Chuyển vòng/.test(text)) {
        bind(b, () => promptMoveStage(app));
      } else if (/Chat/.test(text)) {
        bind(b, async () => {
          try {
            const convId = await startConversation(app.student_id, activeCompany.id);
            location.assign(`${routes.messages}?workspace=employer&conversation=${convId}`);
          } catch (err) {
            showError(err);
          }
        });
      } else if (/Đánh giá|grading/.test(text) || b.id === 'openScorecardBtn') {
        bind(b, () => promptEvaluation(app));
      }
    });

    // Ensure a "Chuyển vòng" button exists on the card if missing
    if (![...c.querySelectorAll('button')].some(b => /Chuyển vòng/.test(label(b)))) {
      const moveBtn = el('button', {
        type: 'button',
        className: 'px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high font-label-sm text-[12px] text-on-surface transition-colors',
      }, 'Chuyển vòng');
      bind(moveBtn, () => promptMoveStage(app));
      c.append(moveBtn);
    }

    // Scorecards (BR-29): the design only has a "Đánh giá" button on one sample card, so add it to every card
    if (![...c.querySelectorAll('button')].some(b => /Đánh giá/.test(label(b)))) {
      const scoreBtn = el('button', {
        type: 'button',
        className: 'px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high font-label-sm text-[12px] text-on-surface transition-colors',
      }, 'Đánh giá');
      bind(scoreBtn, () => promptEvaluation(app));
      c.append(scoreBtn);
    }

    return c;
  }

  function renderBoard() {
    if (!boardEl || !colTemplate) return;
    const filtered = getFilteredApplications();
    renderKpiMetrics();

    boardEl.replaceChildren(...stages.map((stage, stageIdx) => {
      const col = colTemplate.cloneNode(true) as HTMLElement;
      col.dataset.stageId = stage.id;
      const titleEl = col.querySelector('h2');
      if (titleEl) titleEl.textContent = stage.name;

      const stageApps = filtered.filter(a => a.stage_id === stage.id || (!a.stage_id && stageIdx === 0));
      const countEl = col.firstElementChild?.lastElementChild as HTMLElement | null;
      if (countEl) countEl.textContent = String(stageApps.length);

      // Keep only column header, remove dummy cards
      const children = [...col.children];
      children.slice(1).forEach(child => child.remove());

      if (stageApps.length) {
        col.append(...stageApps.map(cardElement));
      } else {
        col.append(el('div', {
          className: 'p-md rounded-xl bg-surface-container-lowest/40 border-dashed border border-outline-variant/40 flex flex-col items-center justify-center text-center gap-xs py-lg'
        }, el('span', { className: 'font-label-sm text-label-sm text-on-surface-variant' }, 'Chưa có ứng viên trong vòng này')));
      }

      return col;
    }));
  }

  function promptMoveStage(app: JobApplication) {
    const studentName = app.student?.full_name || 'Ứng viên';
    dialog(`Chuyển vòng — ${studentName}`, `
      <label>Vòng tuyển dụng mục tiêu
        <select name="stage_id">
          ${stages.map(s => `<option value="${s.id}" ${s.id === app.stage_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </label>
      <label>Ghi chú tiến trình (tùy chọn)
        <textarea name="note" placeholder="Nhập nhận xét hoặc lý do chuyển vòng..."></textarea>
      </label>
    `, 'Chuyển vòng', async form => {
      const targetStageId = value(form, 'stage_id');
      const note = value(form, 'note');
      if (!targetStageId) return;
      try {
        await moveApplicationStage(app.id, targetStageId);
        if (note.trim()) {
          // If a note was added, log it in status
          await updateApplicationStatus(app.id, app.status, note.trim()).catch(() => {});
        }
        toast('Đã cập nhật vòng tuyển dụng.');
        await load();
      } catch (err) {
        showError(err);
      }
    });
  }

  function promptEvaluation(app: JobApplication) {
    const studentName = app.student?.full_name || 'Ứng viên';
    dialog(`Đánh giá ứng viên — ${studentName}`, `
      ${field('score', 'Điểm tổng kết (0–100)', String(app.score ?? 85), 'number')}
      <div class="grid grid-cols-3 gap-sm" style="margin-top:8px">
        <label class="font-label-sm">Kỹ thuật (0-10)
          <input type="number" name="tech" min="0" max="10" step="0.5" value="8.5" class="w-full bg-surface-container-low p-xs rounded">
        </label>
        <label class="font-label-sm">Văn hóa (0-10)
          <input type="number" name="culture" min="0" max="10" step="0.5" value="9" class="w-full bg-surface-container-low p-xs rounded">
        </label>
        <label class="font-label-sm">Giao tiếp (0-10)
          <input type="number" name="comm" min="0" max="10" step="0.5" value="8" class="w-full bg-surface-container-low p-xs rounded">
        </label>
      </div>
      <label style="margin-top:8px">Nhận xét chi tiết
        <textarea name="comment" required placeholder="Ghi chú đánh giá chuyên môn và văn hóa..."></textarea>
      </label>
    `, 'Lưu đánh giá', async form => {
      const totalScore = Number(value(form, 'score'));
      if (isNaN(totalScore) || totalScore < 0 || totalScore > 100) {
        toast('Điểm phải từ 0 đến 100.');
        return;
      }
      const criteria = {
        technical: Number(value(form, 'tech')) || 0,
        culture: Number(value(form, 'culture')) || 0,
        communication: Number(value(form, 'comm')) || 0,
      };
      const comment = value(form, 'comment');
      try {
        await saveEvaluation(app.id, totalScore, criteria, comment);
        toast('Đã lưu phiếu đánh giá.');
        await load();
      } catch (err) {
        showError(err);
      }
    });
  }

  async function openDrawer(appId: string) {
    if (!drawerEl) return;
    selectedAppId = appId;
    drawerEl.classList.remove('hidden');

    // BR-25: First view calls mark_application_viewed
    try {
      await markApplicationViewed(appId);
    } catch {
      // Ignore if already viewed or not allowed
    }

    try {
      const detail = await getApplicationDetail(appId);
      renderDrawerContent(detail);
    } catch (err) {
      showError(err);
    }
  }

  function renderDrawerContent(detail: ApplicationDetail) {
    if (!drawerEl) return;
    const app = detail.application;
    const student = app.student as unknown as JobApplication['student'];
    const name = student?.full_name || student?.email || 'Ứng viên';
    const profile = student?.student_profile;
    const uniName = profile?.university?.name || profile?.university?.short_name || 'Chưa cập nhật trường';

    // Header info
    const nameEl = drawerEl.querySelector('h3') as HTMLElement | null;
    if (nameEl) nameEl.textContent = name;
    const avatarImg = drawerEl.querySelector('img') as HTMLImageElement | null;
    if (avatarImg) {
      avatarImg.src = publicUrl('avatars', student?.avatar_path) || initialsAvatar(name);
      avatarImg.alt = name;
    }
    const schoolEl = nameEl?.parentElement?.nextElementSibling as HTMLElement | null;
    if (schoolEl) schoolEl.textContent = `${profile?.major || 'Chuyên ngành'} • ${uniName}`;

    // GPA & Links
    const linksRow = schoolEl?.nextElementSibling as HTMLElement | null;
    if (linksRow) {
      const links = (profile?.links ?? {}) as Record<string, string>;
      linksRow.replaceChildren();
      if (links.github) {
        linksRow.append(el('a', { href: links.github, target: '_blank', rel: 'noopener', className: 'font-label-sm text-primary hover:underline' }, 'GitHub'));
        linksRow.append(document.createTextNode(' • '));
      }
      if (links.linkedin) {
        linksRow.append(el('a', { href: links.linkedin, target: '_blank', rel: 'noopener', className: 'font-label-sm text-primary hover:underline' }, 'LinkedIn'));
        linksRow.append(document.createTextNode(' • '));
      }
      linksRow.append(el('span', { className: 'font-label-sm text-tertiary font-semibold' }, profile?.gpa ? `GPA: ${profile.gpa.toFixed(2)}/4.0` : 'Chưa có GPA'));
    }

    // Mini CV Preview
    const cvBox = drawerEl.querySelector('#candidateDrawer > div:nth-child(3)') as HTMLElement | null;
    if (cvBox) {
      const cvSnapshot = app.cv_snapshot as unknown as CvContent | null;
      const cvFile = app.cv_file_path;
      const fullScreenBtn = cvBox.querySelector('.cursor-pointer') as HTMLElement | null;
      if (fullScreenBtn) {
        bind(fullScreenBtn, async () => {
          if (cvFile) {
            try {
              const url = await cvSignedUrl(cvFile);
              if (url) window.open(url, '_blank');
            } catch (err) { showError(err); }
          } else if (cvSnapshot) {
            dialog(`CV — ${name}`, `
              <h4>${esc(cvSnapshot.personal?.name || name)}</h4>
              <p><strong>Mục tiêu:</strong> ${esc(cvSnapshot.summary || 'Không có')}</p>
              <p><strong>Kỹ năng:</strong> ${esc((cvSnapshot.skills || []).join(', '))}</p>
              <h5>Dự án:</h5>
              <ul>${(cvSnapshot.projects || []).map(p => `<li><strong>${esc(p.title)}:</strong> ${esc(p.description)}</li>`).join('')}</ul>
            `, 'Đóng');
          } else {
            toast('Không có bản xem trước CV.');
          }
        });
      }
    }

    // Rubric / Scorecard section
    const rubricBox = drawerEl.querySelector('.bg-surface-container-low.p-md.rounded-xl') as HTMLElement | null;
    if (rubricBox) {
      const latestEval = detail.evaluations[0];
      const rubricSummary = rubricBox.querySelector('.font-label-sm.text-tertiary') as HTMLElement | null;
      if (rubricSummary) {
        rubricSummary.textContent = latestEval ? `Tổng kết: ${(latestEval.score / 10).toFixed(1)}/10 (${latestEval.score}đ)` : (app.score ? `${app.score}đ` : 'Chưa đánh giá');
      }
      const noteEl = rubricBox.querySelector('.italic') as HTMLElement | null;
      if (noteEl) {
        noteEl.textContent = latestEval?.comment ? `"${latestEval.comment}"` : 'Chưa có ghi chú đánh giá từ hội đồng phỏng vấn.';
      }
    }

    // Screening Answers section
    let answersContainer = drawerEl.querySelector('.drawer-answers-container') as HTMLElement | null;
    if (!answersContainer) {
      answersContainer = el('div', { className: 'drawer-answers-container flex flex-col gap-xs bg-surface-container-low p-md rounded-xl' });
      rubricBox?.after(answersContainer);
    }
    answersContainer.replaceChildren(
      el('h4', { className: 'font-label-md text-on-surface font-bold mb-1' }, 'Câu hỏi sàng lọc & Trả lời'),
      ...(detail.answers.length ? detail.answers.map(ans => {
        const q = ans.question;
        const passText = ans.passed === true ? 'Đạt' : ans.passed === false ? 'Không đạt' : 'Đã trả lời';
        const passClass = ans.passed === true ? 'ei-chip-active' : ans.passed === false ? 'ei-chip-rejected' : 'ei-chip-draft';
        return el('div', { className: 'p-xs bg-surface-container-lowest rounded-lg mb-1' },
          el('div', { className: 'flex items-center justify-between font-label-sm' },
            el('strong', {}, q?.question || 'Câu hỏi sàng lọc'),
            el('span', { className: `ei-chip ${passClass}` }, passText)
          ),
          el('p', { className: 'font-body-sm text-on-surface mt-1' }, `Trả lời: ${ans.answer}`)
        );
      }) : [el('p', { className: 'ei-muted' }, 'Công việc này không có câu hỏi sàng lọc.')])
    );

    // Status Timeline
    let timelineContainer = drawerEl.querySelector('.drawer-timeline-container') as HTMLElement | null;
    if (!timelineContainer) {
      timelineContainer = el('div', { className: 'drawer-timeline-container flex flex-col gap-xs bg-surface-container-low p-md rounded-xl mt-2' });
      answersContainer.after(timelineContainer);
    }
    timelineContainer.replaceChildren(
      el('h4', { className: 'font-label-md text-on-surface font-bold mb-1' }, 'Tiến trình tuyển dụng'),
      el('ul', { className: 'apps-timeline flex flex-col gap-1 text-[12px]' },
        ...detail.history.map(h => el('li', { className: 'flex items-baseline justify-between py-0.5' },
          el('span', {}, `${applicationStatusLabel[h.to_status] || h.to_status}${h.note ? `: ${h.note}` : ''}`),
          el('span', { className: 'ei-muted' }, relativeTime(h.changed_at))
        ))
      )
    );

    // Footer actions
    const makeOfferBtn = drawerEl.querySelector('#makeOfferBtn') as HTMLButtonElement | null;
    const actionButtons = drawerEl.querySelectorAll<HTMLButtonElement>('.flex.items-center.gap-xs button');
    const scheduleInterviewBtn = actionButtons[0] as HTMLButtonElement | undefined;
    const rejectBtn = actionButtons[1] as HTMLButtonElement | undefined;

    // Interview action
    if (scheduleInterviewBtn) {
      const activeInterview = detail.interviews.find(i => i.status === 'scheduled');
      if (activeInterview) {
        scheduleInterviewBtn.textContent = 'Cập nhật lịch PV';
        bind(scheduleInterviewBtn, () => {
          dialog(`Cập nhật lịch PV — ${name}`, `
            <p>Trạng thái: <strong>${rsvpStatusLabel[activeInterview.rsvp] || activeInterview.rsvp}</strong></p>
            ${activeInterview.proposed_at ? `<p class="ei-chip-warning">Ứng viên đề xuất đổi sang: <strong>${formatDateTime(activeInterview.proposed_at)}</strong> (${esc(activeInterview.rsvp_note || '')})</p>` : ''}
            <label>Thời gian mới (nếu đổi)
              <input type="datetime-local" name="scheduled_at">
            </label>
            <label>Link phòng họp
              <input type="url" name="meeting_url" value="${esc(activeInterview.meeting_url || '')}">
            </label>
            <label>Hành động
              <select name="action">
                <option value="keep">Giữ nguyên lịch</option>
                <option value="completed">Đánh dấu đã hoàn thành</option>
                <option value="cancelled">Hủy buổi phỏng vấn này</option>
              </select>
            </label>
          `, 'Cập nhật', async form => {
            const newTime = value(form, 'scheduled_at');
            const act = value(form, 'action');
            const newUrl = value(form, 'meeting_url');
            try {
              if (act === 'completed' || act === 'cancelled') {
                await updateInterview(activeInterview.id, { status: act });
              } else if (newTime) {
                await updateInterview(activeInterview.id, { scheduled_at: new Date(newTime).toISOString(), meeting_url: newUrl });
              }
              toast('Đã cập nhật lịch phỏng vấn.');
              await load();
              await openDrawer(app.id);
            } catch (err) { showError(err); }
          });
        });
      } else {
        scheduleInterviewBtn.textContent = 'Xếp lịch phỏng vấn';
        bind(scheduleInterviewBtn, () => {
          const defaultTime = new Date(Date.now() + 86400000 * 2);
          defaultTime.setHours(9, 30, 0, 0);
          dialog(`Lên lịch phỏng vấn — ${name}`, `
            <label>Hình thức phỏng vấn
              <select name="mode">
                <option value="online">Trực tuyến (Google Meet / Zoom)</option>
                <option value="onsite">Tại văn phòng công ty</option>
                <option value="phone">Qua điện thoại</option>
              </select>
            </label>
            <label>Thời gian phỏng vấn
              <input type="datetime-local" name="scheduled_at" required value="${localDateTimeInput(defaultTime)}">
            </label>
            <label>Link phòng họp (nếu trực tuyến)
              <input type="url" name="meeting_url" placeholder="https://meet.google.com/..." value="https://meet.google.com/sample-meet">
            </label>
            <label>Địa điểm (nếu tại văn phòng)
              <input type="text" name="location" placeholder="Tầng 12, Tòa nhà TechNova...">
            </label>
            <label>Ghi chú cho ứng viên
              <textarea name="notes" placeholder="Nội dung phỏng vấn, hồ sơ cần chuẩn bị..."></textarea>
            </label>
          `, 'Gửi lời mời phỏng vấn', async form => {
            const timeStr = value(form, 'scheduled_at');
            const mode = value(form, 'mode') as any;
            const meetingUrl = value(form, 'meeting_url');
            const loc = value(form, 'location');
            const notes = value(form, 'notes');
            try {
              await scheduleInterview(app.id, {
                scheduled_at: new Date(timeStr).toISOString(),
                mode,
                meeting_url: meetingUrl,
                location: loc,
              });
              if (notes) {
                try {
                  const convId = await startConversation(app.student_id, company?.id);
                  await sendTextMessage(convId, `Ghi chú phỏng vấn: ${notes}`);
                } catch { /* ignore */ }
              }
              toast('Đã lên lịch và gửi thông báo phỏng vấn.');
              await load();
              await openDrawer(app.id);
            } catch (err) { showError(err); }
          });
        });
      }
    }

    // Rejection action
    if (rejectBtn) {
      if (['rejected', 'hired', 'withdrawn'].includes(app.status)) {
        rejectBtn.hidden = true;
      } else {
        rejectBtn.hidden = false;
        bind(rejectBtn, () => {
          dialog(`Từ chối hồ sơ — ${name}`, `
            <p>Hồ sơ của <strong>${esc(name)}</strong> sẽ chuyển sang trạng thái Từ chối.</p>
            <label>Lý do từ chối (bắt buộc, sẽ hiển thị cho sinh viên)
              <textarea name="reason" required placeholder="Nhập lý do chưa phù hợp để giúp sinh viên cải thiện..."></textarea>
            </label>
          `, 'Xác nhận từ chối', async form => {
            const reason = value(form, 'reason');
            if (!reason.trim()) { toast('Vui lòng nhập lý do từ chối.'); return; }
            try {
              await updateApplicationStatus(app.id, 'rejected', reason.trim());
              toast('Đã từ chối hồ sơ.');
              await load();
              await openDrawer(app.id);
            } catch (err) { showError(err); }
          });
        });
      }
    }

    // Offer action
    if (makeOfferBtn) {
      const activeOffer = detail.offers.find(o => o.status === 'sent');
      if (activeOffer) {
        makeOfferBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">cancel</span><span>Rút lại offer đã gửi</span>';
        bind(makeOfferBtn, () => {
          dialog(`Rút lại thư mời — ${name}`, `
            <p>Rút lại thư mời làm việc gửi tới <strong>${esc(name)}</strong>?</p>
            <label>Lý do rút lại offer (bắt buộc)
              <textarea name="reason" required placeholder="Lý do thay đổi kế hoạch tuyển dụng..."></textarea>
            </label>
          `, 'Rút offer', async form => {
            const reason = value(form, 'reason');
            if (!reason.trim()) { toast('Vui lòng nhập lý do.'); return; }
            try {
              await withdrawOffer(activeOffer.id, reason.trim());
              toast('Đã rút lại thư mời.');
              await load();
              await openDrawer(app.id);
            } catch (err) { showError(err); }
          });
        });
      } else if (app.status === 'hired') {
        makeOfferBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">star</span><span>Đánh giá thực tập sinh</span>';
        bind(makeOfferBtn, () => {
          dialog(`Đánh giá thực tập sinh — ${name}`, `
            <label>Số sao đánh giá (1–5)
              <select name="rating">
                <option value="5" selected>5 sao (Xuất sắc)</option>
                <option value="4">4 sao (Tốt)</option>
                <option value="3">3 sao (Khá)</option>
                <option value="2">2 sao (Trung bình)</option>
                <option value="1">1 sao (Chưa đạt)</option>
              </select>
            </label>
            <label>Nhận xét quá trình thực tập
              <textarea name="comment" required placeholder="Nhận xét thái độ, chuyên môn, đóng góp..."></textarea>
            </label>
          `, 'Lưu đánh giá thực tập', async form => {
            const rating = Number(value(form, 'rating'));
            const comment = value(form, 'comment');
            try {
              await rateIntern(app.id, rating, comment);
              toast('Đã lưu đánh giá thực tập sinh.');
            } catch (err) { showError(err); }
          });
        });
      } else if (['rejected', 'withdrawn', 'offer_declined'].includes(app.status)) {
        makeOfferBtn.hidden = true;
      } else {
        makeOfferBtn.hidden = false;
        makeOfferBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">verified</span><span>Phê duyệt & Gửi Offer chính thức</span>';
        bind(makeOfferBtn, () => {
          const startDate = new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10);
          const expireDate = new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10);
          dialog(`Gửi thư mời nhận việc — ${name}`, `
            ${field('start_date', 'Ngày bắt đầu thực tập', startDate, 'date')}
            ${field('expires_at', 'Hạn phản hồi thư mời', expireDate, 'date')}
            ${field('stipend', 'Mức phụ cấp hàng tháng (VNĐ)', '8000000', 'number')}
            <label>Điều khoản & Cam kết
              <textarea name="terms" placeholder="Thời gian thực tập 3 tháng, hỗ trợ thiết bị làm việc...">Thời gian thực tập 3 tháng, làm việc toàn thời gian.</textarea>
            </label>
            <label>Đính kèm file Offer Letter (PDF tùy chọn)
              <input type="file" name="letter" accept=".pdf,.doc,.docx">
            </label>
          `, 'Gửi thư mời chính thức', async form => {
            const sDate = value(form, 'start_date');
            const expDate = value(form, 'expires_at');
            const stipend = Number(value(form, 'stipend')) || 0;
            const terms = value(form, 'terms');
            const fileInput = form.elements.namedItem('letter') as HTMLInputElement | null;
            let letterPath: string | undefined;

            try {
              if (fileInput?.files?.[0]) {
                letterPath = await uploadOfferLetter(app.id, fileInput.files[0]);
              }
              // If status is still 'applied' or 'cv_viewed', advance to shortlisted first
              if (['applied', 'cv_viewed'].includes(app.status)) {
                await updateApplicationStatus(app.id, 'shortlisted', 'Phê duyệt gửi offer').catch(() => {});
              }
              await sendOffer(app.id, {
                start_date: sDate,
                expires_at: new Date(expDate).toISOString(),
                stipend_amount: stipend,
                terms,
                letter_path: letterPath,
              });
              toast('Đã gửi thư mời nhận việc.');
              await load();
              await openDrawer(app.id);
            } catch (err) { showError(err); }
          });
        });
      }
    }
  }

  // Talent Search Modal (D7)
  function openTalentSearch() {
    dialog('Tìm kiếm hồ sơ sinh viên tiềm năng', `
      <div class="flex flex-col gap-sm">
        <label>Từ khóa (Tên, chuyên ngành, kỹ năng...)
          <input type="text" name="query" placeholder="vd: React, NodeJS, Bách Khoa...">
        </label>
        <div class="grid grid-cols-2 gap-sm">
          <label>Tỉnh/Thành phố
            <input type="text" name="city" placeholder="vd: TP. Hồ Chí Minh">
          </label>
          <label>Năm tốt nghiệp
            <input type="number" name="grad_year" placeholder="vd: 2025">
          </label>
        </div>
      </div>
      <div id="talent-results" style="margin-top:16px; max-height:300px; overflow-y:auto;">
        <p class="ei-muted">Nhập từ khóa và bấm Tìm kiếm để khám phá ứng viên đã bật chế độ tìm việc.</p>
      </div>
    `, 'Tìm kiếm', async form => {
      const resultsEl = document.getElementById('talent-results');
      if (!resultsEl) return;
      resultsEl.innerHTML = '<p class="ei-muted">Đang tìm kiếm...</p>';
      const q = value(form, 'query');
      const cty = value(form, 'city');
      const yr = Number(value(form, 'grad_year')) || undefined;

      try {
        const hits = await searchCandidates({ query: q, city: cty, graduationYear: yr, limit: 15 });
        if (!hits.length) {
          resultsEl.innerHTML = '<p class="ei-muted">Không tìm thấy sinh viên nào phù hợp hoặc đã bật tìm việc.</p>';
          return;
        }
        resultsEl.replaceChildren(
          ...hits.map(student => {
            const card = el('div', { className: 'p-sm bg-surface-container-low rounded-xl mb-2 flex items-center justify-between' },
              el('div', { className: 'flex items-center gap-sm' },
                el('img', {
                  className: 'w-10 h-10 rounded-full object-cover',
                  src: publicUrl('avatars', student.avatar_path) || initialsAvatar(student.full_name || 'SV'),
                  alt: student.full_name || 'SV'
                }),
                el('div', {},
                  el('strong', { className: 'font-label-md text-on-surface' }, student.full_name || 'Sinh viên'),
                  el('p', { className: 'font-body-sm text-on-surface-variant' }, `${student.major || 'Chuyên ngành'} • ${student.university_name || ''}`),
                  el('div', { className: 'flex gap-1 mt-0.5' }, ...(student.skills || []).slice(0, 3).map(sk => el('span', { className: 'ei-chip ei-chip-draft', style: 'font-size:10px' } as never, sk)))
                )
              ),
              el('button', {
                type: 'button',
                className: 'px-sm py-1 rounded bg-primary text-on-primary font-label-sm text-[12px] flex items-center gap-1',
              }, el('span', { className: 'material-symbols-outlined text-[16px]' }, 'chat'), 'Nhắn tin')
            );
            const chatBtn = card.querySelector('button');
            if (chatBtn) {
              chatBtn.addEventListener('click', async () => {
                try {
                  const convId = await startConversation(student.user_id, activeCompany.id);
                  location.assign(`${routes.messages}?workspace=employer&conversation=${convId}`);
                } catch (err) { showError(err); }
              });
            }
            return card;
          })
        );
      } catch (err) { showError(err, resultsEl); }
    });
  }

  // Header quick buttons
  document.querySelectorAll<HTMLButtonElement>('main .candidate-workspace > div:first-child button').forEach(b => {
    const text = label(b);
    if (/Xuất Excel/.test(text)) {
      bind(b, () => {
        const filtered = getFilteredApplications();
        csv(`ung-vien-${currentJob.title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, [
          ['Họ và tên', 'Email', 'Vị trí', 'Trường Đại học', 'GPA', 'Vòng tuyển dụng', 'Trạng thái', 'Điểm đánh giá', 'Ngày nộp'],
          ...filtered.map(a => {
            const sName = a.student?.full_name || '';
            const sEmail = a.student?.email || '';
            const uName = a.student?.student_profile?.university?.name || '';
            const gpa = a.student?.student_profile?.gpa != null ? String(a.student.student_profile.gpa) : '';
            const stName = stages.find(s => s.id === a.stage_id)?.name || 'Hồ sơ mới nộp';
            const stLabel = applicationStatusLabel[a.status] || a.status;
            const sc = a.score != null ? String(a.score) : '';
            const dt = formatDate(a.applied_at);
            return [sName, sEmail, currentJob.title, uName, gpa, stName, stLabel, sc, dt];
          })
        ]);
      });
    } else if (/Gửi mail/.test(text)) {
      bind(b, () => {
        const filtered = getFilteredApplications();
        const emails = filtered.map(a => a.student?.email).filter(Boolean);
        dialog('Gửi email tự động loạt', `
          <p>Gửi tới <strong>${filtered.length} ứng viên</strong> trong danh sách lọc hiện tại:</p>
          <div class="p-xs bg-surface-container-low rounded-lg text-label-sm max-h-24 overflow-y-auto mb-2">
            ${esc(emails.join(', ')) || 'Chưa có email nào'}
          </div>
          <label>Tiêu đề email
            <input type="text" name="subject" required value="Thông báo tiến trình tuyển dụng — ${esc(currentJob.title)}">
          </label>
          <label>Nội dung thông điệp
            <textarea name="content" required rows="4" placeholder="Nhập thông báo gửi tới các bạn ứng viên..."></textarea>
          </label>
        `, 'Gửi email', () => {
          toast(`Đã xếp hàng gửi email tới ${filtered.length} ứng viên.`);
        });
      });
    } else if (/Quy trình/.test(text)) {
      bind(b, () => {
        dialog('Cấu hình quy trình tuyển chọn (Pipeline)', `
          <p class="ei-muted">Tùy chỉnh tên các vòng tuyển chọn cho vị trí <strong>${esc(currentJob.title)}</strong>.</p>
          ${stages.map((st, i) => field(`stage_${st.id}`, `Vòng ${i + 1}`, st.name)).join('')}
          <div style="margin-top:12px">
            <label>Thêm vòng mới
              <input type="text" name="new_stage" placeholder="Nhập tên vòng bổ sung...">
            </label>
          </div>
        `, 'Lưu quy trình', async form => {
          try {
            for (const st of stages) {
              const updatedName = value(form, `stage_${st.id}`);
              if (updatedName && updatedName !== st.name) {
                await updatePipelineStage(st.id, updatedName);
              }
            }
            const newStageName = value(form, 'new_stage');
            if (newStageName?.trim()) {
              await createPipelineStage(currentJob.id, newStageName.trim(), stages.length);
            }
            toast('Đã cập nhật quy trình tuyển dụng.');
            await load();
          } catch (err) { showError(err); }
        });
      });
    }
  });

  // Wire Drawer close button
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  if (closeDrawerBtn) {
    bind(closeDrawerBtn, () => {
      drawerEl?.classList.add('hidden');
      selectedAppId = null;
    });
  }

  // Filter change listeners
  filterSelects.forEach(s => s.addEventListener('change', renderBoard));
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      filterSelects.forEach(s => { s.selectedIndex = 0; });
      renderBoard();
    });
  }

  // Load data for active job
  async function load() {
    if (boardEl) boardEl.replaceChildren(stateBlock('loading'));
    try {
      [stages, applications] = await Promise.all([
        ensureDefaultStages(currentJob.id),
        getJobApplications(currentJob.id),
      ]);
      renderBoard();
      if (updatedLine) updatedLine.textContent = `Cập nhật lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
      // If URL had application param or drawer was previously open
      const urlApp = params.get('application');
      if (urlApp) void openDrawer(urlApp);
      else if (selectedAppId) void openDrawer(selectedAppId);
    } catch (err) {
      if (boardEl) boardEl.replaceChildren(stateBlock('error', undefined, () => void load()));
      showError(err);
    }
  }

  renderJobSelector();
  await load();
}
