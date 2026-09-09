CREATE TABLE public.safety_reports (
  day date PRIMARY KEY,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_reports TO authenticated;
GRANT ALL ON public.safety_reports TO service_role;

ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read safety reports"
ON public.safety_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins can insert safety reports"
ON public.safety_reports FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can update safety reports"
ON public.safety_reports FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete safety reports"
ON public.safety_reports FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));