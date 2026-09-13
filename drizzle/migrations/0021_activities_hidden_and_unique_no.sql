ALTER TABLE public.activities ADD COLUMN hidden_at timestamp with time zone;
ALTER TABLE public.activities ADD COLUMN hidden_source_date date;
CREATE UNIQUE INDEX activities_source_no_uidx ON public.activities (source_file, activity_no) WHERE activity_no IS NOT NULL;
CREATE INDEX activities_hidden_idx ON public.activities (hidden_at) WHERE hidden_at IS NOT NULL;