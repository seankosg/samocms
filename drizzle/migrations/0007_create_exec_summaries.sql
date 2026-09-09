CREATE TABLE public.exec_summaries (
  base date PRIMARY KEY,
  summary text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE ON public.exec_summaries TO authenticated;
GRANT ALL ON public.exec_summaries TO service_role;

ALTER TABLE public.exec_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read exec summaries"
  ON public.exec_summaries FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins can insert exec summaries"
  ON public.exec_summaries FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins can update exec summaries"
  ON public.exec_summaries FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));