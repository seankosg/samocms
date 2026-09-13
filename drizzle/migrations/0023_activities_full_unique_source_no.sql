CREATE UNIQUE INDEX IF NOT EXISTS activities_source_no_all_uidx
  ON public.activities USING btree (source_file, activity_no);

DROP INDEX IF EXISTS public.activities_source_no_uidx;