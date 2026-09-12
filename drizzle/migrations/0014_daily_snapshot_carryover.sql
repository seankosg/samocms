CREATE OR REPLACE FUNCTION public.fill_snapshots_for_day(_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d text;
  src date;
  n integer := 0;
  c integer;
BEGIN
  FOR d IN SELECT DISTINCT discipline FROM public.activity_snapshots WHERE snapshot_date < _date LOOP
    IF NOT EXISTS (SELECT 1 FROM public.activity_snapshots WHERE snapshot_date = _date AND discipline = d) THEN
      SELECT max(snapshot_date) INTO src FROM public.activity_snapshots WHERE snapshot_date < _date AND discipline = d;
      INSERT INTO public.activity_snapshots (
        batch_id, snapshot_date, baseline_date, discipline, item_key, activity_no, activity,
        building, room, work_scope, milestone, subcontractor, unit, done_quantity, total_quantity,
        planned_progress, actual_progress, start_date, finish_date, source_file, manager
      )
      SELECT batch_id, _date, baseline_date, discipline, item_key, activity_no, activity,
        building, room, work_scope, milestone, subcontractor, unit, done_quantity, total_quantity,
        planned_progress, actual_progress, start_date, finish_date, source_file, manager
      FROM public.activity_snapshots
      WHERE snapshot_date = src AND discipline = d;
      GET DIAGNOSTICS c = ROW_COUNT;
      n := n + c;
    END IF;
  END LOOP;

  FOR d IN SELECT DISTINCT discipline FROM public.tc_snapshots WHERE snapshot_date < _date LOOP
    IF NOT EXISTS (SELECT 1 FROM public.tc_snapshots WHERE snapshot_date = _date AND discipline = d) THEN
      SELECT max(snapshot_date) INTO src FROM public.tc_snapshots WHERE snapshot_date < _date AND discipline = d;
      INSERT INTO public.tc_snapshots (
        batch_id, snapshot_date, file_date, discipline, item_key, bldg, grp, item, equip, qty, supplier,
        t0_p, t0_a, t0_d, t0_rem, t1_p, t1_a, t1_d, t1_rem, rp_p, rp_a, rp_d, rp_rem,
        rfi_p, rfi_a, rfi_d, rfi_rem, t2_p, t2_a, resp_p, resp_a, status, docref
      )
      SELECT batch_id, _date, file_date, discipline, item_key, bldg, grp, item, equip, qty, supplier,
        t0_p, t0_a, t0_d, t0_rem, t1_p, t1_a, t1_d, t1_rem, rp_p, rp_a, rp_d, rp_rem,
        rfi_p, rfi_a, rfi_d, rfi_rem, t2_p, t2_a, resp_p, resp_a, status, docref
      FROM public.tc_snapshots
      WHERE snapshot_date = src AND discipline = d;
      GET DIAGNOSTICS c = ROW_COUNT;
      n := n + c;
    END IF;
  END LOOP;

  PERFORM public.refresh_activity_daily(_date);
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.fill_snapshots_backfill()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d date;
  start_d date;
  end_d date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  total integer := 0;
BEGIN
  SELECT min(snapshot_date) INTO start_d FROM public.activity_snapshots;
  IF start_d IS NULL THEN RETURN 0; END IF;
  FOR d IN SELECT generate_series(start_d + 1, end_d, interval '1 day')::date LOOP
    total := total + public.fill_snapshots_for_day(d);
  END LOOP;
  RETURN total;
END;
$$;