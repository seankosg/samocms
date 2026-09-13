CREATE TABLE public.ncr_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ser_no text,
  doc_type text,
  doc_no text NOT NULL,
  description text,
  location text,
  issued_by text,
  issued_date date,
  team text,
  mic text,
  pic text,
  subcontractor text,
  status text,
  current_stage_file text,
  ps1s_p date, ps1s_a date, ps1f_p date, ps1f_a date,
  ps2s_p date, ps2s_a date, ps2f_p date, ps2f_a date,
  ps3s_p date, ps3s_a date, ps3f_p date, ps3f_a date,
  ps4s_p date, ps4s_a date, ps4f_p date, ps4f_a date,
  ps5s_p date, ps5s_a date, ps5f_p date, ps5f_a date,
  ps6s_p date, ps6s_a date, ps6f_p date, ps6f_a date,
  ps7s_p date, ps7s_a date, ps7f_p date, ps7f_a date,
  ps8s_p date, ps8s_a date, ps8f_p date, ps8f_a date,
  ps9s_p date, ps9s_a date, ps9f_p date, ps9f_a date,
  source_file text,
  file_date date,
  hidden_at timestamptz,
  hidden_source_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ncr_items TO authenticated;
GRANT ALL ON public.ncr_items TO service_role;

ALTER TABLE public.ncr_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ncr_items_select_authenticated"
  ON public.ncr_items FOR SELECT TO authenticated USING (true);

CREATE UNIQUE INDEX ncr_items_doc_no_uidx ON public.ncr_items (doc_no);
CREATE INDEX ncr_items_hidden_idx ON public.ncr_items (hidden_at) WHERE hidden_at IS NULL;