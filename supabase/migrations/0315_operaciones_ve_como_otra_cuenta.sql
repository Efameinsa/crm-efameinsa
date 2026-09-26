-- 0315 — Operaciones también puede «Entrar como» otra cuenta (Santos, 26-09).
--
-- Lesly supervisa a Central, comerciales, almacén, postventa, Finanzas y
-- Facturación con la misma herramienta de gerencia (0160). El alcance lo
-- decide la aplicación (src/lib/alcance-auditoria.ts) antes de abrir la
-- sesión; acá solo se le da lo que la pantalla necesita leer:
--
-- · Las auditorías que ella abrió (gerencia sigue viéndolas todas).
-- · La fecha del último ingreso de cada cuenta, y nada más: el registro de
--   accesos trae IP, navegador y ubicación, y eso sigue siendo de gerencia.

create policy auditorias_propias on public.auditorias_sesion
  for select to authenticated
  using (auditor_id = (select auth.uid()));

create or replace function public.ultimos_accesos(p_ids uuid[])
returns table (user_id uuid, ultimo timestamptz)
language sql stable security definer
set search_path = public
as $$
  select a.user_id, max(a.created_at)
    from accesos a
   where a.user_id = any(p_ids)
     and coalesce(rol_actual() in ('gerencia', 'admin', 'operaciones'), false)
   group by a.user_id;
$$;

revoke execute on function public.ultimos_accesos(uuid[]) from public, anon;
grant execute on function public.ultimos_accesos(uuid[]) to authenticated;
