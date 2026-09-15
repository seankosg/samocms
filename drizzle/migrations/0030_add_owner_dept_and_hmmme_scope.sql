ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS owner_dept text;
ALTER TABLE public.activity_snapshots ADD COLUMN IF NOT EXISTS owner_dept text;

CREATE OR REPLACE FUNCTION public.slot_scope(_slot text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(coalesce(_slot,''))
    WHEN 'arch' THEN 'arch'
    WHEN 'int' THEN 'interior'
    WHEN 'elec' THEN 'elec'
    WHEN 'mech' THEN 'mech'
    WHEN 'permit' THEN 'permit'
    WHEN 'ms' THEN 'permit'
    WHEN 'hmmme' THEN 'permit'
    ELSE lower(coalesce(_slot,''))
  END
$function$;