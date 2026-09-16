UPDATE public.manpower_members SET dept = '사업수행팀', updated_at = now()
WHERE telegram_id = '8682845045' AND (dept IS NULL OR dept = '');

CREATE OR REPLACE VIEW public.v_manpower_cards
WITH (security_invoker = on) AS
WITH norm AS (
  SELECT e.id, e.source, e.sheet_row, e.submission_id, e.status,
         e.reporter_name, e.reporter_tg_id, e.company, e.report_date, e.report_time,
         e.location, e.shift, e.staff, e.safety_officer, e.operator, e.worker,
         e.electrician, e.scaffolder, e.plumber, e.subtotal,
         e.submitted_at, e.client_submitted_at, e.client_tz_offset_min, e.synced_at,
         COALESCE(ac.canonical, e.company) AS company_c,
         COALESCE(al.canonical, e.location) AS location_c,
         CASE WHEN e.source = 'HDEC'::public.manpower_source THEN
                CASE WHEN m.dept = ANY (ARRAY['안전 (HSE)'::text, '안전관리팀'::text]) THEN 'HSE'::text ELSE 'EXE'::text END
              ELSE NULL::text END AS grp
  FROM public.manpower_entries e
  LEFT JOIN public.manpower_aliases ac ON ac.kind = 'company'::text AND ac.alias = e.company
  LEFT JOIN public.manpower_aliases al ON al.kind = 'location'::text AND al.alias = e.location
  LEFT JOIN public.manpower_members m ON m.telegram_id = e.reporter_tg_id
), ranked AS (
  SELECT n.*,
         dense_rank() OVER (PARTITION BY n.source, n.company_c, n.report_date, n.location_c, n.shift, n.grp
                            ORDER BY n.submitted_at DESC NULLS LAST, n.submission_id DESC) AS sub_rank,
         dense_rank() OVER (PARTITION BY n.source, n.company_c, n.report_date, n.location_c, n.shift, n.grp
                            ORDER BY n.submitted_at ASC NULLS FIRST, n.submission_id ASC) AS asc_rank
  FROM norm n
), ranked2 AS (
  SELECT r.*, max(r.asc_rank) OVER (PARTITION BY r.source, r.company_c, r.report_date, r.location_c, r.shift, r.grp) AS n_submissions
  FROM ranked r
)
SELECT source,
       company_c AS company,
       report_date,
       location_c AS location,
       shift,
       sum(staff) AS staff,
       sum(safety_officer) AS safety_officer,
       sum(operator) AS operator,
       sum(worker) AS worker,
       sum(electrician) AS electrician,
       sum(scaffolder) AS scaffolder,
       sum(plumber) AS plumber,
       sum(subtotal) AS subtotal,
       (array_agg(reporter_name ORDER BY submitted_at DESC NULLS LAST))[1] AS reporter_name,
       max(submitted_at) AS submitted_at,
       count(*) AS n_rows,
       (array_agg(reporter_tg_id ORDER BY submitted_at DESC NULLS LAST))[1] AS reporter_tg_id,
       (max(n_submissions) - 1)::bigint AS superseded_count,
       grp
FROM ranked2
WHERE sub_rank = 1
GROUP BY source, company_c, report_date, location_c, shift, grp;

GRANT SELECT ON public.v_manpower_cards TO authenticated;
GRANT SELECT ON public.v_manpower_cards TO service_role;

CREATE OR REPLACE VIEW public.v_manpower_hdec_groups
WITH (security_invoker = on) AS
WITH norm AS (
  SELECT e.id,
         COALESCE(ac.canonical, e.company) AS company,
         e.report_date,
         COALESCE(al.canonical, e.location) AS location,
         e.shift,
         CASE WHEN m.dept = ANY (ARRAY['안전 (HSE)'::text, '안전관리팀'::text]) THEN 'HSE'::text ELSE 'EXE'::text END AS grp,
         e.reporter_name, e.reporter_tg_id, e.submitted_at, e.submission_id,
         e.subtotal::bigint AS subtotal
  FROM public.manpower_entries e
  LEFT JOIN public.manpower_aliases ac ON ac.kind = 'company'::text AND ac.alias = e.company
  LEFT JOIN public.manpower_aliases al ON al.kind = 'location'::text AND al.alias = e.location
  LEFT JOIN public.manpower_members m ON m.telegram_id = e.reporter_tg_id
  WHERE e.source = 'HDEC'::public.manpower_source
), ranked AS (
  SELECT norm.*,
         row_number() OVER (PARTITION BY company, report_date, location, shift, grp
                            ORDER BY submitted_at DESC NULLS LAST, id DESC) AS rn,
         dense_rank() OVER (PARTITION BY company, report_date, location, shift, grp
                            ORDER BY submitted_at ASC NULLS FIRST, submission_id ASC) AS asc_rank
  FROM norm
), ranked2 AS (
  SELECT r.*, max(r.asc_rank) OVER (PARTITION BY r.company, r.report_date, r.location, r.shift, r.grp) AS n_submissions
  FROM ranked r
)
SELECT company, report_date, location, shift, grp, reporter_name, reporter_tg_id, submitted_at, subtotal,
       (n_submissions - 1)::bigint AS superseded_count
FROM ranked2
WHERE rn = 1;

GRANT SELECT ON public.v_manpower_hdec_groups TO authenticated;
GRANT SELECT ON public.v_manpower_hdec_groups TO service_role;
