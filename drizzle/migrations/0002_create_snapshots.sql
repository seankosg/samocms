CREATE TABLE public.activity_snapshots (
  id bigserial PRIMARY KEY,
  batch_id bigint REFERENCES public.import_batches(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  baseline_date date,
  discipline text NOT NULL,
  item_key text NOT NULL,
  activity_no text,
  activity text,
  building text,
  room text,
  work_scope text,
  milestone text,
  subcontractor text,
  unit text,
  done_quantity numeric,
  total_quantity numeric,
  planned_progress numeric,
  actual_progress numeric,
  start_date date,
  finish_date date,
  source_file text
);

GRANT SELECT ON public.activity_snapshots TO anon;
GRANT SELECT ON public.activity_snapshots TO authenticated;
GRANT ALL ON public.activity_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.activity_snapshots_id_seq TO service_role;
ALTER TABLE public.activity_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read activity snapshots" ON public.activity_snapshots FOR SELECT USING (true);

CREATE UNIQUE INDEX activity_snapshots_batch_item_uq ON public.activity_snapshots (batch_id, item_key);
CREATE INDEX activity_snapshots_key_date_idx ON public.activity_snapshots (item_key, snapshot_date);
CREATE INDEX activity_snapshots_disc_date_idx ON public.activity_snapshots (discipline, snapshot_date);

CREATE TABLE public.tc_snapshots (
  id bigserial PRIMARY KEY,
  batch_id bigint REFERENCES public.import_batches(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  file_date date,
  discipline text NOT NULL,
  item_key text NOT NULL,
  bldg text,
  grp text,
  item text,
  equip text,
  qty numeric NOT NULL DEFAULT 0,
  supplier text,
  t0_p date, t0_a date, t0_d numeric, t0_rem numeric,
  t1_p date, t1_a date, t1_d numeric, t1_rem numeric,
  rp_p date, rp_a date, rp_d numeric, rp_rem numeric,
  rfi_p date, rfi_a date, rfi_d numeric, rfi_rem numeric,
  t2_p date, t2_a date,
  resp_p date, resp_a date,
  status text,
  docref text
);

GRANT SELECT ON public.tc_snapshots TO anon;
GRANT SELECT ON public.tc_snapshots TO authenticated;
GRANT ALL ON public.tc_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tc_snapshots_id_seq TO service_role;
ALTER TABLE public.tc_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read tc snapshots" ON public.tc_snapshots FOR SELECT USING (true);

CREATE UNIQUE INDEX tc_snapshots_batch_item_uq ON public.tc_snapshots (batch_id, item_key);
CREATE INDEX tc_snapshots_key_date_idx ON public.tc_snapshots (item_key, snapshot_date);
CREATE INDEX tc_snapshots_disc_date_idx ON public.tc_snapshots (discipline, snapshot_date);
