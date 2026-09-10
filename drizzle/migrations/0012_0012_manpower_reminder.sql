-- 봇이 비근무일을 판단하도록 달력을 읽게 한다
GRANT SELECT ON public.manpower_calendar TO anon;
DROP POLICY IF EXISTS "bot reads calendar" ON public.manpower_calendar;
CREATE POLICY "bot reads calendar" ON public.manpower_calendar FOR SELECT TO anon USING (true);