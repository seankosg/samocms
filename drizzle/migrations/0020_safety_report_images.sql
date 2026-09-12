ALTER TABLE public.safety_reports
  ADD COLUMN IF NOT EXISTS jpg_ko_pages integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jpg_en_pages integer NOT NULL DEFAULT 0;

DROP VIEW IF EXISTS public.v_safety_telegram;

CREATE VIEW public.v_safety_telegram AS
WITH s AS (
  SELECT max(value) FILTER (WHERE key = 'safety_tg_cover_ko') AS cover_ko,
         max(value) FILTER (WHERE key = 'safety_tg_cover_en') AS cover_en
  FROM app_settings
)
SELECT r.day,
  CASE WHEN r.pdf_ko_path IS NOT NULL THEN
    'https://project--866f7f2e-b1d1-4d4d-837d-6cbb6217e3f2.lovable.app/api/public/safety-pdf?day='
    || to_char(r.day, 'YYYY-MM-DD') || '&lang=ko&v=' || COALESCE(EXTRACT(epoch FROM r.telegram_ready_at)::bigint, 0)
  END AS pdf_ko_url,
  CASE WHEN r.pdf_en_path IS NOT NULL THEN
    'https://project--866f7f2e-b1d1-4d4d-837d-6cbb6217e3f2.lovable.app/api/public/safety-pdf?day='
    || to_char(r.day, 'YYYY-MM-DD') || '&lang=en&v=' || COALESCE(EXTRACT(epoch FROM r.telegram_ready_at)::bigint, 0)
  END AS pdf_en_url,
  replace(COALESCE(s.cover_ko, ''), '{date}',
    to_char(r.day, 'YYYY') || '년 ' || to_char(r.day, 'FMMM') || '월 ' || to_char(r.day, 'FMDD') || '일 ('
    || (ARRAY['일','월','화','수','목','금','토'])[EXTRACT(dow FROM r.day)::int + 1] || ')') AS cover_ko,
  replace(COALESCE(s.cover_en, ''), '{date}', to_char(r.day, 'DD Mon YYYY (Dy)')) AS cover_en,
  r.telegram_ready_at AS ready_at,
  r.telegram_send_seq AS send_seq,
  COALESCE((
    SELECT jsonb_agg('https://project--866f7f2e-b1d1-4d4d-837d-6cbb6217e3f2.lovable.app/api/public/safety-image?day='
      || to_char(r.day, 'YYYY-MM-DD') || '&lang=ko&page=' || g
      || '&v=' || COALESCE(EXTRACT(epoch FROM r.telegram_ready_at)::bigint, 0) ORDER BY g)
    FROM generate_series(1, r.jpg_ko_pages) g), '[]'::jsonb) AS img_ko_urls,
  COALESCE((
    SELECT jsonb_agg('https://project--866f7f2e-b1d1-4d4d-837d-6cbb6217e3f2.lovable.app/api/public/safety-image?day='
      || to_char(r.day, 'YYYY-MM-DD') || '&lang=en&page=' || g
      || '&v=' || COALESCE(EXTRACT(epoch FROM r.telegram_ready_at)::bigint, 0) ORDER BY g)
    FROM generate_series(1, r.jpg_en_pages) g), '[]'::jsonb) AS img_en_urls,
  r.jpg_ko_pages AS img_ko_pages,
  r.jpg_en_pages AS img_en_pages
FROM safety_reports r
CROSS JOIN s;

GRANT SELECT ON public.v_safety_telegram TO anon, authenticated, service_role;