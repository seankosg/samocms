CREATE TABLE IF NOT EXISTS public.tc_daily_progress (
  id bigserial PRIMARY KEY,
  event_date date NOT NULL,
  discipline text NOT NULL,
  item_key text NOT NULL,
  stage text NOT NULL,
  bldg text,
  grp text,
  item text,
  equip text,
  supplier text,
  qty numeric NOT NULL DEFAULT 0,
  plan_count integer NOT NULL DEFAULT 0,
  plan_qty numeric NOT NULL DEFAULT 0,
  actual_count integer NOT NULL DEFAULT 0,
  actual_qty numeric NOT NULL DEFAULT 0,
  source_file text,
  file_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_date, item_key, stage)
);

CREATE INDEX IF NOT EXISTS tc_daily_progress_date_idx ON public.tc_daily_progress (event_date);
CREATE INDEX IF NOT EXISTS tc_daily_progress_disc_idx ON public.tc_daily_progress (discipline);
CREATE INDEX IF NOT EXISTS tc_daily_progress_stage_idx ON public.tc_daily_progress (stage);

GRANT SELECT ON public.tc_daily_progress TO authenticated;
GRANT ALL ON public.tc_daily_progress TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tc_daily_progress_id_seq TO service_role;

ALTER TABLE public.tc_daily_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read tc daily progress"
  ON public.tc_daily_progress FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.refresh_tc_daily(_discipline text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  CREATE TEMP TABLE _tc_daily_new ON COMMIT DROP AS
  WITH src AS (
    SELECT i.*,
           i.discipline || '|' || coalesce(i.bldg,'') || '|' || coalesce(i.item,'') || '|' || coalesce(i.equip,'') || '|' || coalesce(i.row_no::text,'') AS item_key
    FROM public.tc_items i
    WHERE _discipline IS NULL OR i.discipline = _discipline
  ), ev AS (
    SELECT s.*, x.stage, x.p_date, x.a_date
    FROM src s
    CROSS JOIN LATERAL (VALUES
      ('t0', s.t0_p, s.t0_a),
      ('t1', s.t1_p, s.t1_a),
      ('rp', s.rp_p, s.rp_a),
      ('rfi', s.rfi_p, s.rfi_a),
      ('t2', s.t2_p, s.t2_a),
      ('resp', s.resp_p, s.resp_a)
    ) AS x(stage, p_date, a_date)
  ), dates AS (
    SELECT e.item_key, e.stage, e.discipline, e.bldg, e.grp, e.item, e.equip, e.supplier,
           coalesce(e.qty,0) AS qty, e.source_file, e.file_date, d.event_date,
           CASE WHEN e.p_date = d.event_date THEN 1 ELSE 0 END AS is_plan,
           CASE WHEN e.a_date = d.event_date THEN 1 ELSE 0 END AS is_actual
    FROM ev e
    CROSS JOIN LATERAL (SELECT unnest(ARRAY[e.p_date, e.a_date]) AS event_date) d
    WHERE d.event_date IS NOT NULL
  )
  SELECT event_date, discipline, item_key, stage,
         max(bldg) AS bldg, max(grp) AS grp, max(item) AS item, max(equip) AS equip,
         max(supplier) AS supplier, max(qty) AS qty,
         max(is_plan)::int AS plan_count,
         (max(is_plan) * max(qty))::numeric AS plan_qty,
         max(is_actual)::int AS actual_count,
         (max(is_actual) * max(qty))::numeric AS actual_qty,
         max(source_file) AS source_file, max(file_date) AS file_date
  FROM dates
  GROUP BY event_date, discipline, item_key, stage;

  DELETE FROM public.tc_daily_progress t
  WHERE (_discipline IS NULL OR t.discipline = _discipline)
    AND NOT EXISTS (
      SELECT 1 FROM _tc_daily_new n
      WHERE n.event_date = t.event_date AND n.item_key = t.item_key AND n.stage = t.stage
    );

  INSERT INTO public.tc_daily_progress AS t (
    event_date, discipline, item_key, stage, bldg, grp, item, equip, supplier, qty,
    plan_count, plan_qty, actual_count, actual_qty, source_file, file_date, updated_at
  )
  SELECT event_date, discipline, item_key, stage, bldg, grp, item, equip, supplier, qty,
         plan_count, plan_qty, actual_count, actual_qty, source_file, file_date, now()
  FROM _tc_daily_new
  ON CONFLICT (event_date, item_key, stage) DO UPDATE SET
    discipline = EXCLUDED.discipline,
    bldg = EXCLUDED.bldg, grp = EXCLUDED.grp, item = EXCLUDED.item, equip = EXCLUDED.equip,
    supplier = EXCLUDED.supplier, qty = EXCLUDED.qty,
    plan_count = EXCLUDED.plan_count, plan_qty = EXCLUDED.plan_qty,
    actual_count = EXCLUDED.actual_count, actual_qty = EXCLUDED.actual_qty,
    source_file = EXCLUDED.source_file, file_date = EXCLUDED.file_date,
    updated_at = now();

  GET DIAGNOSTICS n = ROW_COUNT;
  DROP TABLE IF EXISTS _tc_daily_new;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_tc_daily(text) FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_tc_daily(text) TO service_role;