CREATE OR REPLACE VIEW public.v_manpower_hdec_groups AS
WITH norm AS (
  SELECT e.id,
         COALESCE(ac.canonical, e.company) AS company,
         e.report_date,
         COALESCE(al.canonical, e.location) AS location,
         e.shift,
         CASE WHEN m.dept IN ('안전 (HSE)', '안전관리팀') THEN 'HSE' ELSE 'EXE' END AS grp,
         e.reporter_name,
         e.reporter_tg_id,
         e.submitted_at,
         e.subtotal::bigint AS subtotal
  FROM public.manpower_entries e
  LEFT JOIN public.manpower_aliases ac ON ac.kind = 'company' AND ac.alias = e.company
  LEFT JOIN public.manpower_aliases al ON al.kind = 'location' AND al.alias = e.location
  LEFT JOIN public.manpower_members m ON m.telegram_id = e.reporter_tg_id
  WHERE e.source = 'HDEC'
), ranked AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY company, report_date, location, shift, grp
           ORDER BY submitted_at DESC NULLS LAST, id DESC
         ) AS rn,
         COUNT(*) OVER (
           PARTITION BY company, report_date, location, shift, grp
         ) AS n_total
  FROM norm
)
SELECT company, report_date, location, shift, grp,
       reporter_name, reporter_tg_id, submitted_at, subtotal,
       (n_total - 1)::bigint AS superseded_count
FROM ranked
WHERE rn = 1;

DROP VIEW IF EXISTS public.v_manpower_compare;

CREATE VIEW public.v_manpower_compare AS
SELECT COALESCE(s.company, hse.company, exe.company) AS company,
       COALESCE(s.report_date, hse.report_date, exe.report_date) AS report_date,
       COALESCE(s.location, hse.location, exe.location) AS location,
       COALESCE(s.shift, hse.shift, exe.shift) AS shift,
       s.subtotal AS reported,
       COALESCE(hse.subtotal, exe.subtotal) AS verified,
       COALESCE(hse.subtotal, exe.subtotal, 0) - COALESCE(s.subtotal, 0) AS diff,
       CASE
         WHEN s.subtotal IS NULL THEN 'HDEC ONLY'
         WHEN hse.subtotal IS NULL AND exe.subtotal IS NULL THEN 'NOT COUNTED'
         WHEN COALESCE(hse.subtotal, exe.subtotal) = s.subtotal THEN 'MATCH'
         ELSE 'DIFF'
       END AS result,
       hse.subtotal AS hse_verified,
       COALESCE(hse.subtotal, 0) - COALESCE(s.subtotal, 0) AS hse_diff,
       CASE
         WHEN s.subtotal IS NULL AND hse.subtotal IS NOT NULL THEN 'HDEC ONLY'
         WHEN hse.subtotal IS NULL THEN NULL
         WHEN hse.subtotal = s.subtotal THEN 'MATCH'
         ELSE 'DIFF'
       END AS hse_result,
       hse.reporter_name AS hse_counter,
       hse.reporter_tg_id AS hse_counter_tg_id,
       hse.superseded_count AS hse_superseded,
       exe.subtotal AS exe_verified,
       COALESCE(exe.subtotal, 0) - COALESCE(s.subtotal, 0) AS exe_diff,
       CASE
         WHEN s.subtotal IS NULL AND exe.subtotal IS NOT NULL THEN 'HDEC ONLY'
         WHEN exe.subtotal IS NULL THEN NULL
         WHEN exe.subtotal = s.subtotal THEN 'MATCH'
         ELSE 'DIFF'
       END AS exe_result,
       exe.reporter_name AS exe_counter,
       exe.reporter_tg_id AS exe_counter_tg_id,
       exe.superseded_count AS exe_superseded,
       COALESCE(hse.reporter_name, exe.reporter_name) AS hdec_counter,
       COALESCE(hse.reporter_tg_id, exe.reporter_tg_id) AS hdec_counter_tg_id,
       COALESCE(hse.superseded_count, exe.superseded_count) AS hdec_superseded,
       s.reporter_name AS sub_reporter,
       s.reporter_tg_id AS sub_reporter_tg_id,
       s.superseded_count AS sub_superseded
FROM (SELECT * FROM public.v_manpower_cards WHERE source = 'SUB') s
FULL JOIN (SELECT * FROM public.v_manpower_hdec_groups WHERE grp = 'HSE') hse
  ON s.company = hse.company AND s.report_date = hse.report_date AND s.location = hse.location AND s.shift = hse.shift
FULL JOIN (SELECT * FROM public.v_manpower_hdec_groups WHERE grp = 'EXE') exe
  ON COALESCE(s.company, hse.company) = exe.company
  AND COALESCE(s.report_date, hse.report_date) = exe.report_date
  AND COALESCE(s.location, hse.location) = exe.location
  AND COALESCE(s.shift, hse.shift) = exe.shift;

GRANT SELECT ON public.v_manpower_hdec_groups TO authenticated;
GRANT SELECT ON public.v_manpower_hdec_groups TO service_role;
GRANT SELECT ON public.v_manpower_compare TO authenticated;
GRANT SELECT ON public.v_manpower_compare TO service_role;