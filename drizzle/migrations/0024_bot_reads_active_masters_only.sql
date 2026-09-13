DROP POLICY "bot reads companies" ON public.manpower_companies;
CREATE POLICY "bot reads companies" ON public.manpower_companies
  FOR SELECT TO anon USING (is_active);

DROP POLICY "bot reads locations" ON public.manpower_locations;
CREATE POLICY "bot reads locations" ON public.manpower_locations
  FOR SELECT TO anon USING (is_active);