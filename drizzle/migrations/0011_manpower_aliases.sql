CREATE TABLE IF NOT EXISTS public.manpower_aliases (
  kind        text NOT NULL CHECK (kind IN ('company','location')),
  alias       text NOT NULL,
  canonical   text NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, alias)
);

GRANT SELECT ON public.manpower_aliases TO anon, authenticated;
GRANT ALL ON public.manpower_aliases TO service_role;

ALTER TABLE public.manpower_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bot reads aliases" ON public.manpower_aliases;
CREATE POLICY "bot reads aliases" ON public.manpower_aliases FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "users read aliases" ON public.manpower_aliases;
CREATE POLICY "users read aliases" ON public.manpower_aliases FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.v_manpower_cards WITH (security_invoker = on) AS
SELECT e.source,
       coalesce(ac.canonical, e.company)  AS company,
       e.report_date,
       coalesce(al.canonical, e.location) AS location,
       e.shift,
       sum(e.staff) AS staff, sum(e.safety_officer) AS safety_officer, sum(e.operator) AS operator,
       sum(e.worker) AS worker, sum(e.electrician) AS electrician, sum(e.scaffolder) AS scaffolder,
       sum(e.plumber) AS plumber, sum(e.subtotal) AS subtotal,
       max(e.reporter_name) AS reporter_name, max(e.submitted_at) AS submitted_at, count(*) AS n_rows
FROM public.manpower_entries e
LEFT JOIN public.manpower_aliases ac ON ac.kind = 'company'  AND ac.alias = e.company
LEFT JOIN public.manpower_aliases al ON al.kind = 'location' AND al.alias = e.location
WHERE e.status = 'ACTIVE'
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE FUNCTION public.manpower_name_usage()
RETURNS TABLE (kind text, name text, entry_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'company'::text, company, count(*) FROM public.manpower_entries GROUP BY company
  UNION ALL
  SELECT 'location'::text, location, count(*) FROM public.manpower_entries GROUP BY location
$$;

GRANT EXECUTE ON FUNCTION public.manpower_name_usage() TO authenticated, service_role;