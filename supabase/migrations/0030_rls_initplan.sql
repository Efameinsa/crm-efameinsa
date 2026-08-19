-- ============================================================
-- CRM EFAMEINSA · Migración 0030 · RLS con initplan (rendimiento)
-- ============================================================
-- Medido 2026-08-19: `select count(*) from leads where estado='pendiente_triaje'`
-- como gerencia = 3,8 s. Causa: las políticas llaman rol_actual()/auth.uid()/
-- es_backoffice() DESNUDAS, y Postgres las evalúa POR FILA — con los 39 mil
-- leads históricos importados hoy, cada consulta ejecuta la subconsulta de
-- perfiles 39 mil veces. El arreglo estándar de Supabase: envolver cada
-- llamada en (select …) para que el planificador la evalúe UNA vez (InitPlan).
--
-- En vez de reescribir ~30 políticas a mano (y arriesgar cambiar su lógica),
-- este DO recorre pg_policies y reescribe cada USING/WITH CHECK reemplazando
-- las tres funciones por su versión envuelta. La lógica queda IDÉNTICA.

do $$
declare
  p record;
  nuevo_using text;
  nuevo_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%rol_actual()%'
        or coalesce(qual, '') like '%auth.uid()%'
        or coalesce(qual, '') like '%es_backoffice()%'
        or coalesce(with_check, '') like '%rol_actual()%'
        or coalesce(with_check, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%es_backoffice()%')
  loop
    nuevo_using := replace(replace(replace(p.qual,
      'rol_actual()', '(select rol_actual())'),
      'auth.uid()', '(select auth.uid())'),
      'es_backoffice()', '(select es_backoffice())');
    nuevo_check := replace(replace(replace(p.with_check,
      'rol_actual()', '(select rol_actual())'),
      'auth.uid()', '(select auth.uid())'),
      'es_backoffice()', '(select es_backoffice())');

    if p.qual is not null and p.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, nuevo_using, nuevo_check);
    elsif p.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)',
        p.policyname, p.schemaname, p.tablename, nuevo_using);
    elsif p.with_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)',
        p.policyname, p.schemaname, p.tablename, nuevo_check);
    end if;
    raise notice 'política optimizada: %.%', p.tablename, p.policyname;
  end loop;
end $$;

-- Índice para la bandeja y el SLA: leads por estado (39k filas, se consulta
-- pendiente_triaje/asignado constantemente).
create index if not exists ix_leads_estado_recibido on leads (estado, recibido_at);
create index if not exists ix_leads_asignado_at on leads (asignado_a, asignado_at) where asignado_a is not null;
