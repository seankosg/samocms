ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS manager text;
ALTER TABLE public.activity_snapshots ADD COLUMN IF NOT EXISTS manager text;