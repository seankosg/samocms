CREATE OR REPLACE VIEW public.v_manpower_cards AS
WITH norm AS (
  SELECT e.id,
         e.source,
         e.sheet_row,
         e.submission_id,
         e.status,
         e.reporter_name,
         e.reporter_tg_id,
         e.company,
         e.report_date,
         e.report_time,
         e.location,
         e.shift,
         e.staff,
         e.safety_officer,
         e.operator,
         e.worker,
         e.electrician,
         e.scaffolder,
         e.plumber,
         e.subtotal,
         e.submitted_at,
         e.client_submitted_at,
         e.client_tz_offset_min,
         e.synced_at,
         COALESCE(ac.canonical, e.company) AS company_c,
         COALESCE(al.canonical, e.location) AS location_c,
         CASE
           WHEN e.source = 'HDEC'::manpower_source THEN
             CASE WHEN m.dept = ANY (ARRAY['안전 (HSE)'::text, '안전관리팀'::text]) THEN 'HSE'::text ELSE 'EXE'::text END
           ELSE NULL::text
         END AS grp
  FROM manpower_entries e
  LEFT JOIN manpower_aliases ac ON ac.kind = 'company'::text AND ac.alias = e.company
  LEFT JOIN manpower_aliases al ON al.kind = 'location'::text AND al.alias = e.location
  LEFT JOIN manpower_members m ON m.telegram_id = e.reporter_tg_id
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
       (array_agg(reporter_name ORDER BY a.submitted_at DESC NULLS LAST))[1] AS reporter_name,
       max(submitted_at) AS submitted_at,
       count(*) AS n_rows,
       (array_agg(reporter_tg_id ORDER BY a.submitted_at DESC NULLS LAST))[1] AS reporter_tg_id,
       (SELECT count(*) AS count
          FROM norm s
         WHERE s.status = 'SUPERSEDED'::text
           AND s.source = a.source
           AND s.company_c = a.company_c
           AND s.report_date = a.report_date
           AND s.location_c = a.location_c
           AND s.shift = a.shift
           AND s.grp IS NOT DISTINCT FROM a.grp) AS superseded_count,
       a.grp
FROM norm a
WHERE status = 'ACTIVE'::text
GROUP BY source, company_c, report_date, location_c, shift, grp;