CREATE TABLE IF NOT EXISTS public.activity_daily_progress (
  id bigserial PRIMARY KEY,
  snapshot_date date NOT NULL,
  prev_date date,
  discipline text NOT NULL,
  source_file text,
  item_key text NOT NULL,
  activity text,
  planned_progress numeric,
  actual_progress numeric,
  prev_planned_progress numeric,
  prev_actual_progress numeric,
  plan_delta numeric,
  actual_delta numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, item_key)
);

CREATE INDEX IF NOT EXISTS activity_daily_progress_date_idx ON public.activity_daily_progress (snapshot_date);
CREATE INDEX IF NOT EXISTS activity_daily_progress_item_idx ON public.activity_daily_progress (item_key);

GRANT SELECT ON public.activity_daily_progress TO authenticated;
GRANT ALL ON public.activity_daily_progress TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.activity_daily_progress_id_seq TO service_role;

ALTER TABLE public.activity_daily_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read activity daily progress"
  ON public.activity_daily_progress FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.refresh_activity_daily(_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH cur AS (
    SELECT DISTINCT ON (item_key) *
    FROM public.activity_snapshots
    WHERE snapshot_date = _date
    ORDER BY item_key, id DESC
  ), prev AS (
    SELECT DISTINCT ON (item_key) *
    FROM public.activity_snapshots
    WHERE snapshot_date = _date - 1
    ORDER BY item_key, id DESC
  )
  INSERT INTO public.activity_daily_progress AS t (
    snapshot_date, prev_date, discipline, source_file, item_key, activity,
    planned_progress, actual_progress, prev_planned_progress, prev_actual_progress,
    plan_delta, actual_delta, updated_at
  )
  SELECT c.snapshot_date, _date - 1, c.discipline, c.source_file, c.item_key, c.activity,
         c.planned_progress, c.actual_progress, p.planned_progress, p.actual_progress,
         CASE WHEN c.planned_progress IS NOT NULL AND p.planned_progress IS NOT NULL
              THEN c.planned_progress - p.planned_progress END,
         CASE WHEN c.actual_progress IS NOT NULL AND p.actual_progress IS NOT NULL
              THEN c.actual_progress - p.actual_progress END,
         now()
  FROM cur c
  LEFT JOIN prev p ON p.item_key = c.item_key
  ON CONFLICT (snapshot_date, item_key) DO UPDATE SET
    prev_date = EXCLUDED.prev_date,
    discipline = EXCLUDED.discipline,
    source_file = EXCLUDED.source_file,
    activity = EXCLUDED.activity,
    planned_progress = EXCLUDED.planned_progress,
    actual_progress = EXCLUDED.actual_progress,
    prev_planned_progress = EXCLUDED.prev_planned_progress,
    prev_actual_progress = EXCLUDED.prev_actual_progress,
    plan_delta = EXCLUDED.plan_delta,
    actual_delta = EXCLUDED.actual_delta,
    updated_at = now();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_activity_daily_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE d date; total integer := 0;
BEGIN
  FOR d IN SELECT DISTINCT snapshot_date FROM public.activity_snapshots ORDER BY 1 LOOP
    total := total + public.refresh_activity_daily(d);
  END LOOP;
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_activity_daily(date) FROM public;
REVOKE ALL ON FUNCTION public.refresh_activity_daily_all() FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_activity_daily(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_activity_daily_all() TO service_role;