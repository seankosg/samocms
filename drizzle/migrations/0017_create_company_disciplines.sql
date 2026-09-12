CREATE TABLE public.company_disciplines (
  name text PRIMARY KEY,
  discipline text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_disciplines TO authenticated;
GRANT SELECT ON public.company_disciplines TO anon;
GRANT ALL ON public.company_disciplines TO service_role;

ALTER TABLE public.company_disciplines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read company disciplines" ON public.company_disciplines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "bot reads company disciplines" ON public.company_disciplines
  FOR SELECT TO anon USING (true);