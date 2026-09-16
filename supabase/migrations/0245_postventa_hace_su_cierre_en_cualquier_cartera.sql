-- ============================================================
-- CRM EFAMEINSA · Migración 0245 · Postventa hace su cierre en cualquier cartera
-- ============================================================
-- 16-09-2026, caso de Ariana (PV1, postventa1@) con INVERSIONES TUNUPA LODGE:
-- vendió el embalaje en jaula de madera (Presu_624-26) y al guardar el cierre
-- le salió «new row violates row-level security policy for table
-- "informes_cierre"».
--
-- POR QUÉ. Desde la 0049 el cierre lo crea, edita y emite el comercial de la
-- CARTERA del cliente (o gerencia). Postventa vende servicios —mantenimiento,
-- repuestos, embalajes— sobre clientes que son de Ariana, de Katerine o de
-- Brenda, y la cartera no se mueve (decisión del 28-08). Resultado: la cuenta
-- del área tiene «Ventas emitidas» en el menú y «Nuevo informe» en la ficha,
-- y ninguna de las dos puede hacer nada. Rubí lo resolvía en Word con los
-- números apartados desde el 30 (reunión 03-09), que era justo lo que había
-- que dejar de hacer.
--
-- LA REGLA NUEVA: quien puede postventa (`puede_postventa()`: del área o con
-- la tarea, como Ariana en C4) crea el cierre de cualquier cliente, y ese
-- cierre es SUYO —lo edita, lo borra mientras es borrador y lo emite quien lo
-- creó—. El comercial de la cartera lo sigue viendo como siempre (0049): es
-- su cliente. La venta atada, como siempre, la registra el expediente
-- (0148): postventa abre el suyo desde la ficha («Ofrecer mantenimiento»).
-- ============================================================

-- ── 1. Crear, editar y borrar lo propio ─────────────────────────────────────
drop policy if exists informes_crea_postventa on public.informes_cierre;
create policy informes_crea_postventa on public.informes_cierre for insert to authenticated
  with check ((select puede_postventa()) and creado_por = (select auth.uid()));

drop policy if exists informes_edita_postventa on public.informes_cierre;
create policy informes_edita_postventa on public.informes_cierre for update to authenticated
  using ((select puede_postventa()) and creado_por = (select auth.uid()));

drop policy if exists informes_borra_postventa on public.informes_cierre;
create policy informes_borra_postventa on public.informes_cierre for delete to authenticated
  using (emitido_at is null and (select puede_postventa()) and creado_por = (select auth.uid()));

-- Quien lo creó lo lee aunque el cliente no sea de su cartera ni sea del área
-- (Ariana en C4 con `hace_postventa`, cerrando un mantenimiento de la ruta).
drop policy if exists informes_lectura_propios on public.informes_cierre;
create policy informes_lectura_propios on public.informes_cierre for select to authenticated
  using (creado_por = (select auth.uid()) and es_prueba = es_cuenta_prueba());

-- ── 2. Emitirlo ─────────────────────────────────────────────────────────────
-- Sobre la definición viva (la última la tocó la 0233 con el IGV por
-- renglón): solo se abre la puerta a quien lo creó desde postventa.
do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'emitir_informe';
  v_nueva := replace(v_def,
    $old$     and not exists (select 1 from cuentas c where c.id = v_informe.cuenta_id and c.comercial_id = auth.uid()) then$old$,
    $new$     and not exists (select 1 from cuentas c where c.id = v_informe.cuenta_id and c.comercial_id = auth.uid())
     -- Postventa emite el cierre que ella misma creó, sea de quien sea el cliente (0245).
     and not (puede_postventa() and v_informe.creado_por = auth.uid()) then$new$);
  if v_nueva = v_def then raise exception 'emitir_informe: no se encontró la comprobación de cartera'; end if;
  execute v_nueva;
end $$;

-- ── 3. «Mis cierres» sabe cuáles son míos ───────────────────────────────────
-- Columna calculada para filtrar desde PostgREST (`.eq("es_de_quien_mira",
-- true)`): un `or` entre una columna propia y una de la tabla embebida no
-- existe en PostgREST. Mío = lo creé, o el cliente es de mi cartera.
create or replace function public.es_de_quien_mira(i public.informes_cierre)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select i.creado_por = auth.uid()
      or exists (select 1 from cuentas c where c.id = i.cuenta_id and c.comercial_id = auth.uid())
$$;
revoke all on function public.es_de_quien_mira(public.informes_cierre) from public;
grant execute on function public.es_de_quien_mira(public.informes_cierre) to authenticated;
comment on function public.es_de_quien_mira(public.informes_cierre) is
  'Para «Mis cierres»: el informe lo creé yo o es de un cliente de mi cartera (0245).';
