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
    ELSE lower(coalesce(_slot,''))
  END
$function$;