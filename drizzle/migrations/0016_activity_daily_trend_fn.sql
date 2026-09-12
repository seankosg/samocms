CREATE OR REPLACE FUNCTION public.activity_daily_trend(_discipline text DEFAULT NULL::text)
RETURNS TABLE(snapshot_date date, item_count bigint, planned_avg numeric, actual_avg numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT snapshot_date,
         count(*) AS item_count,
         avg(coalesce(planned_progress, 0)) AS planned_avg,
         avg(coalesce(actual_progress, 0)) AS actual_avg
  FROM public.activity_snapshots
  WHERE _discipline IS NULL OR discipline = _discipline
  GROUP BY snapshot_date
  ORDER BY snapshot_date
$$;