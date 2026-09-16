-- 1) 당사 재집계 그룹: 대체된(SUPERSEDED) 기록 제외, 유효(ACTIVE) 기록만 최신 1건 채택
CREATE OR REPLACE VIEW public.v_manpower_hdec_groups
WITH (security_invoker = on) AS
WITH norm AS (
  SELECT e.id,
         COALESCE(ac.canonical, e.company) AS company,
         e.report_date,
         COALESCE(al.canonical, e.location) AS location,
         e.shift,
         CASE WHEN m.dept = ANY (ARRAY['안전 (HSE)'::text, '안전관리팀'::text]) THEN 'HSE'::text ELSE 'EXE'::text END AS grp,
         e.reporter_name,
         e.reporter_tg_id,
         e.submitted_at,
         e.subtotal::bigint AS subtotal
  FROM public.manpower_entries e
  LEFT JOIN public.manpower_aliases ac ON ac.kind = 'company'::text AND ac.alias = e.company
  LEFT JOIN public.manpower_aliases al ON al.kind = 'location'::text AND al.alias = e.location
  LEFT JOIN public.manpower_members m ON m.telegram_id = e.reporter_tg_id
  WHERE e.source = 'HDEC'::public.manpower_source
    AND e.status = 'ACTIVE'::text
), ranked AS (
  SELECT norm.*,
         row_number() OVER (PARTITION BY norm.company, norm.report_date, norm.location, norm.shift, norm.grp ORDER BY norm.submitted_at DESC NULLS LAST, norm.id DESC) AS rn,
         count(*) OVER (PARTITION BY norm.company, norm.report_date, norm.location, norm.shift, norm.grp) AS n_total
  FROM norm
)
SELECT company, report_date, location, shift, grp, reporter_name, reporter_tg_id, submitted_at, subtotal,
       n_total - 1 AS superseded_count
FROM ranked
WHERE rn = 1;

GRANT SELECT ON public.v_manpower_hdec_groups TO authenticated;
GRANT SELECT ON public.v_manpower_hdec_groups TO service_role;

-- 2) 검증 대조 뷰: 재집계가 없는 칸의 차이는 NULL(미확인)로 표시. verified 는 HSE 우선(합산 아님)
CREATE OR REPLACE VIEW public.v_manpower_compare
WITH (security_invoker = on) AS
SELECT COALESCE(s.company, hse.company, exe.company) AS company,
       COALESCE(s.report_date, hse.report_date, exe.report_date) AS report_date,
       COALESCE(s.location, hse.location, exe.location) AS location,
       COALESCE(s.shift, hse.shift, exe.shift) AS shift,
       s.subtotal AS reported,
       COALESCE(hse.subtotal, exe.subtotal) AS verified,
       CASE
         WHEN s.subtotal IS NULL THEN COALESCE(hse.subtotal, exe.subtotal)
         WHEN hse.subtotal IS NULL AND exe.subtotal IS NULL THEN NULL
         ELSE COALESCE(hse.subtotal, exe.subtotal) - s.subtotal
       END AS diff,
       CASE
         WHEN s.subtotal IS NULL THEN 'HDEC ONLY'::text
         WHEN hse.subtotal IS NULL AND exe.subtotal IS NULL THEN 'NOT COUNTED'::text
         WHEN COALESCE(hse.subtotal, exe.subtotal) = s.subtotal THEN 'MATCH'::text
         ELSE 'DIFF'::text
       END AS result,
       hse.subtotal AS hse_verified,
       CASE
         WHEN hse.subtotal IS NULL THEN NULL::bigint
         WHEN s.subtotal IS NULL THEN hse.subtotal
         ELSE hse.subtotal - s.subtotal
       END AS hse_diff,
       CASE
         WHEN s.subtotal IS NULL AND hse.subtotal IS NOT NULL THEN 'HDEC ONLY'::text
         WHEN hse.subtotal IS NULL THEN NULL::text
         WHEN hse.subtotal = s.subtotal THEN 'MATCH'::text
         ELSE 'DIFF'::text
       END AS hse_result,
       hse.reporter_name AS hse_counter,
       hse.reporter_tg_id AS hse_counter_tg_id,
       hse.superseded_count AS hse_superseded,
       exe.subtotal AS exe_verified,
       CASE
         WHEN exe.subtotal IS NULL THEN NULL::bigint
         WHEN s.subtotal IS NULL THEN exe.subtotal
         ELSE exe.subtotal - s.subtotal
       END AS exe_diff,
       CASE
         WHEN s.subtotal IS NULL AND exe.subtotal IS NOT NULL THEN 'HDEC ONLY'::text
         WHEN exe.subtotal IS NULL THEN NULL::text
         WHEN exe.subtotal = s.subtotal THEN 'MATCH'::text
         ELSE 'DIFF'::text
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
FROM ( SELECT v.source, v.company, v.report_date, v.location, v.shift,
              v.staff, v.safety_officer, v.operator, v.worker, v.electrician, v.scaffolder, v.plumber,
              v.subtotal, v.reporter_name, v.submitted_at, v.n_rows, v.reporter_tg_id, v.superseded_count
       FROM public.v_manpower_cards v
       WHERE v.source = 'SUB'::public.manpower_source) s
FULL JOIN ( SELECT g.company, g.report_date, g.location, g.shift, g.grp, g.reporter_name, g.reporter_tg_id, g.submitted_at, g.subtotal, g.superseded_count
            FROM public.v_manpower_hdec_groups g WHERE g.grp = 'HSE'::text) hse
  ON s.company = hse.company AND s.report_date = hse.report_date AND s.location = hse.location AND s.shift = hse.shift
FULL JOIN ( SELECT g.company, g.report_date, g.location, g.shift, g.grp, g.reporter_name, g.reporter_tg_id, g.submitted_at, g.subtotal, g.superseded_count
            FROM public.v_manpower_hdec_groups g WHERE g.grp = 'EXE'::text) exe
  ON COALESCE(s.company, hse.company) = exe.company AND COALESCE(s.report_date, hse.report_date) = exe.report_date
 AND COALESCE(s.location, hse.location) = exe.location AND COALESCE(s.shift, hse.shift) = exe.shift;

GRANT SELECT ON public.v_manpower_compare TO authenticated;
GRANT SELECT ON public.v_manpower_compare TO service_role;