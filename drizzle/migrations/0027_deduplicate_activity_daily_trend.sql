CREATE OR REPLACE FUNCTION public.activity_daily_trend(_discipline text DEFAULT NULL::text)
RETURNS TABLE(snapshot_date date, item_count bigint, planned_avg numeric, actual_avg numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH latest AS (
    SELECT DISTINCT ON (s.snapshot_date, s.item_key)
           s.snapshot_date,
           s.item_key,
           s.planned_progress,
           s.actual_progress
    FROM public.activity_snapshots s
    WHERE _discipline IS NULL OR s.discipline = _discipline
    ORDER BY s.snapshot_date, s.item_key, s.captured_at DESC, s.id DESC
  )
  SELECT snapshot_date,
         count(*) AS item_count,
         avg(coalesce(planned_progress, 0)) AS planned_avg,
         avg(coalesce(actual_progress, 0)) AS actual_avg
  FROM latest
  GROUP BY snapshot_date
  ORDER BY snapshot_date
$function$;