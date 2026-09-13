ALTER TABLE public.manpower_members ADD COLUMN position text;
ALTER TABLE public.manpower_members ADD COLUMN dept text;

CREATE OR REPLACE VIEW public.v_manpower_cards WITH (security_invoker = on) AS
WITH norm AS (
  SELECT e.*,
         coalesce(ac.canonical, e.company)  AS company_c,
         coalesce(al.canonical, e.location) AS location_c
  FROM public.manpower_entries e
  LEFT JOIN public.manpower_aliases ac ON ac.kind = 'company'  AND ac.alias = e.company
  LEFT JOIN public.manpower_aliases al ON al.kind = 'location' AND al.alias = e.location
)
SELECT a.source,
       a.company_c AS company,
       a.report_date,
       a.location_c AS location,
       a.shift,
       sum(a.staff) AS staff, sum(a.safety_officer) AS safety_officer, sum(a.operator) AS operator,
       sum(a.worker) AS worker, sum(a.electrician) AS electrician, sum(a.scaffolder) AS scaffolder,
       sum(a.plumber) AS plumber, sum(a.subtotal) AS subtotal,
       (array_agg(a.reporter_name ORDER BY a.submitted_at DESC NULLS LAST))[1] AS reporter_name,
       max(a.submitted_at) AS submitted_at, count(*) AS n_rows,
       (array_agg(a.reporter_tg_id ORDER BY a.submitted_at DESC NULLS LAST))[1] AS reporter_tg_id,
       (SELECT count(*) FROM norm s
        WHERE s.status = 'SUPERSEDED'
          AND s.source = a.source
          AND s.company_c = a.company_c
          AND s.report_date = a.report_date
          AND s.location_c = a.location_c
          AND s.shift = a.shift) AS superseded_count
FROM norm a
WHERE a.status = 'ACTIVE'
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW public.v_manpower_compare WITH (security_invoker = on) AS
SELECT coalesce(s.company, h.company) AS company,
       coalesce(s.report_date, h.report_date) AS report_date,
       coalesce(s.location, h.location) AS location,
       coalesce(s.shift, h.shift) AS shift,
       s.subtotal AS reported,
       h.subtotal AS verified,
       coalesce(h.subtotal, 0) - coalesce(s.subtotal, 0) AS diff,
       CASE WHEN s.subtotal IS NULL THEN 'HDEC ONLY'
            WHEN h.subtotal IS NULL THEN 'NOT COUNTED'
            WHEN s.subtotal = h.subtotal THEN 'MATCH'
            ELSE 'DIFF' END AS result,
       s.reporter_name AS sub_reporter,
       h.reporter_name AS hdec_counter,
       s.reporter_tg_id AS sub_reporter_tg_id,
       h.reporter_tg_id AS hdec_counter_tg_id,
       s.superseded_count AS sub_superseded,
       h.superseded_count AS hdec_superseded
FROM (SELECT * FROM public.v_manpower_cards WHERE source = 'SUB') s
FULL JOIN (SELECT * FROM public.v_manpower_cards WHERE source = 'HDEC') h
  ON s.company = h.company AND s.report_date = h.report_date AND s.location = h.location AND s.shift = h.shift;