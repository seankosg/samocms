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
    'https://project--866f7f2e-b1d1-4d4d-837d-6cbb6217e3f2.lovable.app/api/public/safety-pdf?day='
      || to_char(r.day, 'YYYY-MM-DD') || '&lang=ko&v='
      || COALESCE(extract(epoch FROM r.telegram_ready_at)::bigint, 0)
  END AS pdf_ko_url,
  CASE WHEN r.pdf_en_path IS NOT NULL THEN
    'https://project--866f7f2e-b1d1-4d4d-837d-6cbb6217e3f2.lovable.app/api/public/safety-pdf?day='
      || to_char(r.day, 'YYYY-MM-DD') || '&lang=en&v='
      || COALESCE(extract(epoch FROM r.telegram_ready_at)::bigint, 0)
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