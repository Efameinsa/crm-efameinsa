-- ============================================================
-- CRM EFAMEINSA · Migración 0245 · El velocímetro de postventa
-- ============================================================
-- Carlos, 16-09: «garantía y ventas. En ventas tienes que tener tu
-- velocímetro, definitivamente». Ariana cerró una venta como PV1 y no la veía
-- en ningún velocímetro: `resumen_gerencia` deja fuera a las cuentas de
-- postventa para que el ranking de gerencia sea solo de comerciales, y eso
-- también las dejaba fuera de su propio panel. Cuando se pide POR ESA
-- cuenta, entra; el ranking de gerencia sigue igual. La meta del área
-- (US$ 25 000/mes, Carlos) quedó en `perfiles.meta_mensual` de PV, PV1 y PV2
-- hasta que gerencia la reparta.
-- ============================================================
do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resumen_gerencia';
  v_nueva := replace(v_def,
    $old$  where p.rol = 'comercial' and p.activo and not p.es_prueba and not p.es_postventa
    and (p_comercial is null or p.id = p_comercial);$old$,
    $new$  where p.rol = 'comercial' and p.activo and not p.es_prueba
    and (not p.es_postventa or p.id = p_comercial)
    and (p_comercial is null or p.id = p_comercial);$new$);
  if v_nueva = v_def then raise exception 'resumen_gerencia: no se encontró el filtro de comerciales'; end if;
  execute v_nueva;
end $$;
