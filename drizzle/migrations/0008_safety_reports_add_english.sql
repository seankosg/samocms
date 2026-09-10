ALTER TABLE public.safety_reports
  ADD COLUMN IF NOT EXISTS risks_en jsonb,
  ADD COLUMN IF NOT EXISTS generated_at_en timestamptz;