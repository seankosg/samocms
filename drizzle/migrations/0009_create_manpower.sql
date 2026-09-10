CREATE TYPE public.manpower_source AS ENUM ('SUB','HDEC');

CREATE TABLE public.manpower_entries (
  id              bigserial PRIMARY KEY,
  source          public.manpower_source NOT NULL,
  sheet_row       integer NOT NULL,
  submission_id   text NOT NULL,
  status          text NOT NULL CHECK (status IN ('ACTIVE','SUPERSEDED')),
  reporter_name   text,
  reporter_tg_id  text,
  company         text NOT NULL,
  report_date     date NOT NULL,
  report_time     text,
  location        text NOT NULL,
  shift           text NOT NULL CHECK (shift IN ('Day Shift','Overtime','Night Shift')),
  staff           integer NOT NULL DEFAULT 0,
  safety_officer  integer NOT NULL DEFAULT 0,
  operator        integer NOT NULL DEFAULT 0,
  worker          integer NOT NULL DEFAULT 0,
  electrician     integer NOT NULL DEFAULT 0,
  scaffolder      integer NOT NULL DEFAULT 0,
  plumber         integer NOT NULL DEFAULT 0,
  subtotal        integer NOT NULL DEFAULT 0,
  submitted_at    timestamptz,
  client_submitted_at timestamptz,
  client_tz_offset_min integer,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manpower_entries_source_row_key UNIQUE (source, sheet_row)
);
CREATE INDEX manpower_entries_date_company_idx ON public.manpower_entries (report_date, company);
CREATE INDEX manpower_entries_active_idx ON public.manpower_entries (status) WHERE status = 'ACTIVE';
CREATE INDEX manpower_entries_submission_idx ON public.manpower_entries (submission_id);

CREATE TABLE public.manpower_members (
  telegram_id   text PRIMARY KEY,
  name          text NOT NULL,
  company       text,
  role          text NOT NULL DEFAULT 'SUB' CHECK (role IN ('SUB','HDEC')),
  is_active     boolean NOT NULL DEFAULT true,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.manpower_companies (
  name          text PRIMARY KEY,
  short_name    text,
  discipline    text,
  contract_no   text,
  active_from   date,
  active_to     date,
  sort_order    integer NOT NULL,
  is_active     boolean NOT NULL DEFAULT true
);

CREATE TABLE public.manpower_locations (
  name          text PRIMARY KEY,
  bldg_code     text,
  zone          text,
  sort_order    integer NOT NULL,
  is_active     boolean NOT NULL DEFAULT true
);

CREATE TABLE public.manpower_plan (
  id            bigserial PRIMARY KEY,
  company       text NOT NULL,
  plan_date     date NOT NULL,
  granularity   text NOT NULL DEFAULT 'week' CHECK (granularity IN ('day','week')),
  planned_total integer NOT NULL,
  planned_by_trade jsonb,
  rev           text,
  source_file   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, plan_date, granularity, rev)
);

CREATE TABLE public.manpower_calendar (
  day           date PRIMARY KEY,
  is_workday    boolean NOT NULL DEFAULT true,
  note          text
);

CREATE TABLE public.manpower_ingest_log (
  id            bigserial PRIMARY KEY,
  received_at   timestamptz NOT NULL DEFAULT now(),
  mode          text NOT NULL,
  rows_in       integer NOT NULL DEFAULT 0,
  rows_upserted integer NOT NULL DEFAULT 0,
  warnings      jsonb,
  ok            boolean NOT NULL DEFAULT true,
  error         text
);

GRANT SELECT, INSERT, UPDATE ON public.manpower_entries TO anon;
GRANT SELECT, INSERT, UPDATE ON public.manpower_ingest_log TO anon;
GRANT SELECT ON public.manpower_members TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.manpower_entries_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.manpower_ingest_log_id_seq TO anon;

GRANT SELECT ON public.manpower_entries, public.manpower_members, public.manpower_companies,
                public.manpower_locations, public.manpower_plan, public.manpower_calendar,
                public.manpower_ingest_log TO authenticated;

GRANT ALL ON public.manpower_entries, public.manpower_members, public.manpower_companies,
             public.manpower_locations, public.manpower_plan, public.manpower_calendar,
             public.manpower_ingest_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.manpower_entries_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.manpower_ingest_log_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.manpower_plan_id_seq TO service_role;

ALTER TABLE public.manpower_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot writes entries"  ON public.manpower_entries FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "bot updates entries" ON public.manpower_entries FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "bot reads entries"   ON public.manpower_entries FOR SELECT TO anon USING (true);
CREATE POLICY "users read entries"  ON public.manpower_entries FOR SELECT TO authenticated USING (true);

ALTER TABLE public.manpower_ingest_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot writes ingest log" ON public.manpower_ingest_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "bot updates ingest log" ON public.manpower_ingest_log FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "bot reads ingest log"  ON public.manpower_ingest_log FOR SELECT TO anon USING (true);
CREATE POLICY "users read ingest log" ON public.manpower_ingest_log FOR SELECT TO authenticated USING (true);

ALTER TABLE public.manpower_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot reads members"   ON public.manpower_members FOR SELECT TO anon USING (true);
CREATE POLICY "users read members"  ON public.manpower_members FOR SELECT TO authenticated USING (true);

ALTER TABLE public.manpower_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read companies" ON public.manpower_companies FOR SELECT TO authenticated USING (true);

ALTER TABLE public.manpower_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read locations" ON public.manpower_locations FOR SELECT TO authenticated USING (true);

ALTER TABLE public.manpower_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read plan" ON public.manpower_plan FOR SELECT TO authenticated USING (true);

ALTER TABLE public.manpower_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read calendar" ON public.manpower_calendar FOR SELECT TO authenticated USING (true);

CREATE VIEW public.v_manpower_cards WITH (security_invoker = on) AS
SELECT source, company, report_date, location, shift,
       sum(staff) staff, sum(safety_officer) safety_officer, sum(operator) operator,
       sum(worker) worker, sum(electrician) electrician, sum(scaffolder) scaffolder,
       sum(plumber) plumber, sum(subtotal) subtotal,
       max(reporter_name) reporter_name, max(submitted_at) submitted_at, count(*) n_rows
FROM public.manpower_entries WHERE status = 'ACTIVE'
GROUP BY 1,2,3,4,5;

CREATE VIEW public.v_manpower_daily WITH (security_invoker = on) AS
SELECT source, company, report_date,
       sum(CASE WHEN shift='Day Shift'   THEN subtotal ELSE 0 END) day_total,
       sum(CASE WHEN shift='Overtime'    THEN subtotal ELSE 0 END) ot_total,
       sum(CASE WHEN shift='Night Shift' THEN subtotal ELSE 0 END) night_total,
       sum(staff) staff, sum(safety_officer) safety_officer, sum(operator) operator, sum(worker) worker,
       sum(electrician) electrician, sum(scaffolder) scaffolder, sum(plumber) plumber,
       sum(subtotal) total, count(*) cards, min(submitted_at) first_submitted_at
FROM public.v_manpower_cards GROUP BY 1,2,3;

CREATE VIEW public.v_manpower_compare WITH (security_invoker = on) AS
SELECT coalesce(s.company,h.company) company, coalesce(s.report_date,h.report_date) report_date,
       coalesce(s.location,h.location) location, coalesce(s.shift,h.shift) shift,
       s.subtotal reported, h.subtotal verified,
       CASE WHEN s.subtotal IS NOT NULL AND h.subtotal IS NOT NULL THEN h.subtotal - s.subtotal END diff,
       CASE WHEN s.subtotal IS NULL THEN 'HDEC ONLY' WHEN h.subtotal IS NULL THEN 'NOT COUNTED'
            WHEN s.subtotal = h.subtotal THEN 'MATCH' ELSE 'DIFF' END result,
       s.reporter_name sub_reporter, h.reporter_name hdec_counter
FROM (SELECT * FROM public.v_manpower_cards WHERE source='SUB') s
FULL OUTER JOIN (SELECT * FROM public.v_manpower_cards WHERE source='HDEC') h
  ON s.company=h.company AND s.report_date=h.report_date AND s.location=h.location AND s.shift=h.shift;

GRANT SELECT ON public.v_manpower_cards, public.v_manpower_daily, public.v_manpower_compare TO authenticated;
GRANT SELECT ON public.v_manpower_cards, public.v_manpower_daily, public.v_manpower_compare TO anon;
GRANT SELECT ON public.v_manpower_cards, public.v_manpower_daily, public.v_manpower_compare TO service_role;