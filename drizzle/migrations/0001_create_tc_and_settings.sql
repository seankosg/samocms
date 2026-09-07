CREATE TABLE public.tc_items (
  id bigserial PRIMARY KEY,
  discipline text NOT NULL,
  row_no integer,
  bldg text,
  bldg_raw text,
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
  docref text,
  source_file text,
  file_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tc_items TO anon, authenticated;
GRANT ALL ON public.tc_items TO service_role;
ALTER TABLE public.tc_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read tc items" ON public.tc_items FOR SELECT USING (true);
CREATE INDEX tc_items_discipline_idx ON public.tc_items (discipline);
CREATE INDEX tc_items_bldg_idx ON public.tc_items (bldg);

CREATE TABLE public.tc_manual (
  id bigserial PRIMARY KEY,
  discipline text NOT NULL,
  block text NOT NULL,
  item_key text NOT NULL,
  memo text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discipline, block, item_key)
);
GRANT SELECT ON public.tc_manual TO anon, authenticated;
GRANT ALL ON public.tc_manual TO service_role;
ALTER TABLE public.tc_manual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read tc manual" ON public.tc_manual FOR SELECT USING (true);

CREATE TABLE public.import_batches (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  slot text NOT NULL,
  file_name text NOT NULL,
  file_date date,
  rev integer,
  row_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.import_batches TO anon, authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read import batches" ON public.import_batches FOR SELECT USING (true);

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read app settings" ON public.app_settings FOR SELECT USING (true);

INSERT INTO public.app_settings (key, value) VALUES ('baseline_date', '2026-09-05');
INSERT INTO public.import_batches (kind, slot, file_name, file_date, row_count) VALUES
 ('tc','Mech','TC_Mech_260905_R1.xlsx','2026-09-05',193);