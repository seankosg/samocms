ALTER TABLE public.manpower_companies ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.manpower_locations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT ON public.manpower_companies TO anon;
GRANT SELECT ON public.manpower_locations TO anon;

DROP POLICY IF EXISTS "bot reads companies" ON public.manpower_companies;
CREATE POLICY "bot reads companies" ON public.manpower_companies FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "bot reads locations" ON public.manpower_locations;
CREATE POLICY "bot reads locations" ON public.manpower_locations FOR SELECT TO anon USING (true);