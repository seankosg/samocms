ALTER TABLE public.safety_reports
  ADD COLUMN IF NOT EXISTS pdf_ko_path text,
  ADD COLUMN IF NOT EXISTS pdf_en_path text,
  ADD COLUMN IF NOT EXISTS telegram_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_send_seq integer NOT NULL DEFAULT 0;

-- 봇(anon)이 읽어야 하는 설정 키만 공개
DROP POLICY IF EXISTS "Anon read bot settings" ON public.app_settings;
CREATE POLICY "Anon read bot settings"
ON public.app_settings FOR SELECT TO anon
USING (key LIKE 'safety_tg_%' OR key LIKE 'manpower_%');
GRANT SELECT ON public.app_settings TO anon;

CREATE OR REPLACE VIEW public.v_safety_telegram AS
WITH s AS (
  SELECT
    max(value) FILTER (WHERE key = 'safety_tg_cover_ko') AS cover_ko,
    max(value) FILTER (WHERE key = 'safety_tg_cover_en') AS cover_en
  FROM public.app_settings
)
SELECT
  r.day,
  CASE WHEN r.pdf_ko_path IS NOT NULL THEN
    'https://knwfxgvbfgqxyfdazssq.supabase.co/storage/v1/object/public/safety-reports/' || r.pdf_ko_path
    || '?v=' || COALESCE(extract(epoch FROM r.telegram_ready_at)::bigint, 0)
  END AS pdf_ko_url,
  CASE WHEN r.pdf_en_path IS NOT NULL THEN
    'https://knwfxgvbfgqxyfdazssq.supabase.co/storage/v1/object/public/safety-reports/' || r.pdf_en_path
    || '?v=' || COALESCE(extract(epoch FROM r.telegram_ready_at)::bigint, 0)
  END AS pdf_en_url,
  replace(
    COALESCE(s.cover_ko, ''),
    '{date}',
    to_char(r.day, 'YYYY') || '년 ' || to_char(r.day, 'FMMM') || '월 ' || to_char(r.day, 'FMDD') || '일 ('
      || (ARRAY['일','월','화','수','목','금','토'])[extract(dow FROM r.day)::int + 1] || ')'
  ) AS cover_ko,
  replace(
    COALESCE(s.cover_en, ''),
    '{date}',
    to_char(r.day, 'DD Mon YYYY (Dy)')
  ) AS cover_en,
  r.telegram_ready_at AS ready_at,
  r.telegram_send_seq AS send_seq
FROM public.safety_reports r
CROSS JOIN s;

GRANT SELECT ON public.v_safety_telegram TO anon, authenticated, service_role;