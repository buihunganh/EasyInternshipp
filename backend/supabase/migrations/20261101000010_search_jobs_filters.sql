-- =============================================================================
-- EasyInternshipp — 10: search_jobs for the home page filters (Phase 4)
--   * several work types / schedules at once (aside checkboxes)
--   * quick chips: urgent (deadline ≤ 7 days), final-year internships, partner universities
--   * sort by views; card fields (excerpt, skills, perks, views)
-- Replaces the 8-argument version so the Data API has a single, unambiguous function.
-- =============================================================================

drop function if exists public.search_jobs(text, text, integer, public.work_type, integer, text, integer, integer);

create or replace function public.search_jobs(
  p_query           text default null,
  p_city            text default null,
  p_industry_id     integer default null,
  p_work_type       public.work_type default null,
  p_min_stipend     integer default null,
  p_sort            text default 'relevance',      -- relevance | newest | stipend | match | views
  p_limit           integer default 20,
  p_offset          integer default 0,
  p_work_types      public.work_type[] default null,
  p_schedules       public.work_schedule[] default null,
  p_urgent          boolean default false,         -- deadline within 7 days
  p_final_year      boolean default false,         -- targets final-year students (year ≥ 4)
  p_university_codes text[] default null,          -- e.g. {HCMUT,HUST}: exclusive to or partnered with these
  p_company_id      uuid default null,
  p_exclude_job     uuid default null)
returns table (
  id uuid, company_id uuid, company_name text, company_logo_path text, company_verified boolean,
  title text, city text, work_type public.work_type, schedule public.work_schedule,
  stipend_min integer, stipend_max integer, stipend_negotiable boolean,
  deadline timestamptz, published_at timestamptz, application_count integer,
  is_exclusive boolean, match_score smallint, rank real, total_count bigint,
  excerpt text, skills text[], perks text[], view_count integer, industry_id smallint)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select case when nullif(trim(p_query), '') is null then null
                else websearch_to_tsquery('simple'::regconfig, private.unaccent_immutable(trim(p_query))) end as tsq
  ),
  unis as (
    select u.id from public.universities u
    where p_university_codes is not null and u.short_name = any (p_university_codes)
  ),
  hits as (
    select j.*, c.name as c_name, c.logo_path as c_logo, (c.verification_status = 'verified') as c_verified,
           public.job_match_score(j.id) as m_score,
           case when q.tsq is null then 0 else ts_rank(j.search, q.tsq) end as r
    from public.jobs j
    join public.companies c on c.id = j.company_id
    cross join q
    where j.status = 'active'
      and (j.deadline is null or j.deadline > now())
      and (q.tsq is null or j.search @@ q.tsq or j.title ilike '%' || trim(p_query) || '%'
           or private.unaccent_immutable(c.name) ilike '%' || private.unaccent_immutable(trim(p_query)) || '%')
      and (p_city is null or private.unaccent_immutable(coalesce(j.city, '') || ' ' || coalesce(j.address, ''))
                              ilike '%' || private.unaccent_immutable(p_city) || '%')
      and (p_industry_id is null or j.industry_id = p_industry_id)
      and (p_work_type is null or j.work_type = p_work_type)
      and (p_work_types is null or cardinality(p_work_types) = 0 or j.work_type = any (p_work_types))
      and (p_schedules is null or cardinality(p_schedules) = 0 or j.schedule = any (p_schedules))
      and (p_min_stipend is null or coalesce(j.stipend_max, j.stipend_min, 0) >= p_min_stipend)
      and (not coalesce(p_urgent, false) or (j.deadline is not null and j.deadline < now() + interval '7 days'))
      and (not coalesce(p_final_year, false) or exists (select 1 from unnest(j.target_study_years) y where y >= 4))
      and (p_university_codes is null
           or j.university_id in (select id from unis)
           or exists (select 1 from public.university_partnerships up
                      where up.company_id = j.company_id and up.status = 'active' and up.university_id in (select id from unis)))
      and (p_company_id is null or j.company_id = p_company_id)
      and (p_exclude_job is null or j.id <> p_exclude_job)
  )
  select h.id, h.company_id, h.c_name, h.c_logo, h.c_verified, h.title, h.city, h.work_type, h.schedule,
         h.stipend_min, h.stipend_max, h.stipend_negotiable, h.deadline, h.published_at, h.application_count,
         h.university_id is not null, h.m_score, h.r, count(*) over (),
         left(regexp_replace(h.description, '\s+', ' ', 'g'), 240),
         coalesce((select array_agg(s.name order by js.is_required desc, s.name)
                   from public.job_skills js join public.skills s on s.id = js.skill_id where js.job_id = h.id), '{}'),
         h.perks, h.view_count, h.industry_id
  from hits h
  order by
    case when p_sort = 'stipend' then coalesce(h.stipend_max, h.stipend_min, 0) end desc nulls last,
    case when p_sort = 'match' then h.m_score end desc nulls last,
    case when p_sort = 'views' then h.view_count end desc nulls last,
    case when p_sort = 'relevance' then h.r end desc nulls last,
    h.published_at desc nulls last
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

grant execute on function public.search_jobs(text, text, integer, public.work_type, integer, text, integer, integer,
  public.work_type[], public.work_schedule[], boolean, boolean, text[], uuid, uuid) to anon, authenticated, service_role;
