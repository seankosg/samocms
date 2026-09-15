UPDATE public.activities SET planned_progress = LEAST(1, planned_progress/100) WHERE planned_progress > 1;
UPDATE public.activities SET actual_progress = LEAST(1, actual_progress/100) WHERE actual_progress > 1;
UPDATE public.activity_snapshots SET planned_progress = LEAST(1, planned_progress/100) WHERE planned_progress > 1;
UPDATE public.activity_snapshots SET actual_progress = LEAST(1, actual_progress/100) WHERE actual_progress > 1;
SELECT public.refresh_activity_daily_all();