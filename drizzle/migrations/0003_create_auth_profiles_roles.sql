CREATE TYPE public.app_role AS ENUM ('admin','user','guest');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  full_name text NOT NULL,
  position text,
  team text,
  must_change_password boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope)
);
GRANT SELECT ON public.user_scopes TO authenticated;
GRANT ALL ON public.user_scopes TO service_role;
ALTER TABLE public.user_scopes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.slot_scope(_slot text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(_slot,''))
    WHEN 'arch' THEN 'arch'
    WHEN 'int' THEN 'arch'
    WHEN 'elec' THEN 'elec'
    WHEN 'mech' THEN 'mech'
    WHEN 'permit' THEN 'permit'
    WHEN 'ms' THEN 'permit'
    ELSE lower(coalesce(_slot,''))
  END
$$;

CREATE OR REPLACE FUNCTION public.can_edit_slot(_user_id uuid, _slot text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR (
      public.has_role(_user_id, 'user')
      AND EXISTS (
        SELECT 1 FROM public.user_scopes s
        WHERE s.user_id = _user_id AND s.scope = public.slot_scope(_slot)
      )
    )
$$;

CREATE POLICY "Authenticated can read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Authenticated can read roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read scopes" ON public.user_scopes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public can read project activities" ON public.activities;
DROP POLICY IF EXISTS "Public can read activity snapshots" ON public.activity_snapshots;
DROP POLICY IF EXISTS "Public can read app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Public can read import batches" ON public.import_batches;
DROP POLICY IF EXISTS "Public can read tc items" ON public.tc_items;
DROP POLICY IF EXISTS "Public can read tc manual" ON public.tc_manual;
DROP POLICY IF EXISTS "Public can read tc snapshots" ON public.tc_snapshots;

CREATE POLICY "Authenticated read activities" ON public.activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read activity snapshots" ON public.activity_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read app settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read import batches" ON public.import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read tc items" ON public.tc_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read tc manual" ON public.tc_manual FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read tc snapshots" ON public.tc_snapshots FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.activities FROM anon;
REVOKE SELECT ON public.activity_snapshots FROM anon;
REVOKE SELECT ON public.app_settings FROM anon;
REVOKE SELECT ON public.import_batches FROM anon;
REVOKE SELECT ON public.tc_items FROM anon;
REVOKE SELECT ON public.tc_manual FROM anon;
REVOKE SELECT ON public.tc_snapshots FROM anon;

GRANT SELECT ON public.activities TO authenticated;
GRANT SELECT ON public.activity_snapshots TO authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT SELECT ON public.import_batches TO authenticated;
GRANT SELECT ON public.tc_items TO authenticated;
GRANT SELECT ON public.tc_manual TO authenticated;
GRANT SELECT ON public.tc_snapshots TO authenticated;