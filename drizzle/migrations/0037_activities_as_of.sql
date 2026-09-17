CREATE OR REPLACE FUNCTION public.activities_as_of(_base date)
RETURNS TABLE(
  item_key text,
  snapshot_date date,
  done_quantity numeric,
  total_quantity numeric,
  actual_progress numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (s.item_key)
    s.item_key,
    s.snapshot_date,
    s.done_quantity,
    s.total_quantity,
    s.actual_progress
  FROM public.activity_snapshots s
  WHERE s.snapshot_date <= _base
  ORDER BY s.item_key, s.snapshot_date DESC, s.captured_at DESC, s.id DESC
$$;

GRANT EXECUTE ON FUNCTION public.activities_as_of(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activities_as_of(date) TO service_role;