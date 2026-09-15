CREATE OR REPLACE FUNCTION public.can_edit_slot(_user_id uuid, _slot text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, 'admin')
    OR (
      EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role::text = 'owner')
      AND lower(coalesce(_slot, '')) = 'hmmme'
    )
    OR (
      public.has_role(_user_id, 'user')
      AND EXISTS (
        SELECT 1 FROM public.user_scopes s
        WHERE s.user_id = _user_id AND s.scope = public.slot_scope(_slot)
      )
    )
$function$;