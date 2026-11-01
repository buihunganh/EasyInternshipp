// Migration 10 / Phase 4: search_jobs filters used by the home page (BR-17, BR-18).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './harness.mjs';

let db, admin, owner, company, jobs;
const inDays = d => new Date(Date.now() + d * 86400000).toISOString();
before(async () => {
  db = await createDb();
  admin = await db.makeAdmin('admin@example.com');
  ({ owner, company } = await db.verifiedCompany(admin, 'TechNova Solutions'));
  jobs = {
    remote: await db.activeJob(admin, owner, company, { title: 'Remote Designer Intern', work_type: 'remote', schedule: 'part_time', stipend_min: 3000000 }),
    hybrid: await db.activeJob(admin, owner, company, { title: 'Hybrid Dev Intern', work_type: 'hybrid', stipend_min: 9000000, stipend_max: 12000000, deadline: inDays(3), target_study_years: [4] }),
    onsite: await db.activeJob(admin, owner, company, { title: 'Onsite QA Intern', work_type: 'onsite', city: 'Hà Nội' }),
  };
  await db.q(owner, 'insert into public.job_skills (job_id, skill_id) select $1, id from public.skills where name in ($2, $3)', [jobs.hybrid, 'React', 'TypeScript']);
});

const ids = rows => rows.map(r => r.id);

describe('search_jobs v2', () => {
  it('filters by several work types and schedules', async () => {
    const r = await db.rpc(null, 'search_jobs', { p_work_types: ['remote', 'hybrid'] });
    assert.deepEqual(new Set(ids(r)), new Set([jobs.remote, jobs.hybrid]));
    assert.deepEqual(ids(await db.rpc(null, 'search_jobs', { p_schedules: ['part_time'] })), [jobs.remote]);
  });

  it('quick chips: urgent, stipend, final year', async () => {
    assert.deepEqual(ids(await db.rpc(null, 'search_jobs', { p_urgent: true })), [jobs.hybrid]);
    assert.deepEqual(ids(await db.rpc(null, 'search_jobs', { p_min_stipend: 8000000 })), [jobs.hybrid]);
    assert.deepEqual(ids(await db.rpc(null, 'search_jobs', { p_final_year: true })), [jobs.hybrid]);
  });

  it('partner universities: exclusive or MoU partner jobs only', async () => {
    assert.deepEqual(ids(await db.rpc(null, 'search_jobs', { p_university_codes: ['HCMUT'] })), []);
    const uni = (await db.one(`select id from public.universities where short_name = 'HCMUT'`)).id;
    await db.sql(`insert into public.university_partnerships (university_id, company_id, status) values ($1, $2, 'active')`, [uni, company]);
    assert.equal((await db.rpc(null, 'search_jobs', { p_university_codes: ['HCMUT'] })).length, 3);
  });

  it('keyword matches the company name; city matches the address', async () => {
    assert.equal((await db.rpc(null, 'search_jobs', { p_query: 'technova' })).length, 3);
    assert.deepEqual(ids(await db.rpc(null, 'search_jobs', { p_city: 'ha noi' })), [jobs.onsite]);
  });

  it('returns card fields and supports company / exclude filters for "similar jobs"', async () => {
    const [row] = await db.rpc(null, 'search_jobs', { p_query: 'Hybrid Dev' });
    assert.deepEqual(row.skills, ['React', 'TypeScript']);
    assert.ok(row.excerpt.length > 10);
    const similar = await db.rpc(null, 'search_jobs', { p_company_id: company, p_exclude_job: jobs.hybrid });
    assert.ok(!ids(similar).includes(jobs.hybrid));
    assert.equal(Number(similar[0].total_count), 2);
  });

  it('sorts by views and paginates with total_count', async () => {
    await db.sql('update public.jobs set view_count = 50 where id = $1', [jobs.onsite]);
    const [top] = await db.rpc(null, 'search_jobs', { p_sort: 'views', p_limit: 1 });
    assert.equal(top.id, jobs.onsite);
    assert.equal(Number(top.total_count), 3);
    const page2 = await db.rpc(null, 'search_jobs', { p_limit: 2, p_offset: 2 });
    assert.equal(page2.length, 1);
  });
});
