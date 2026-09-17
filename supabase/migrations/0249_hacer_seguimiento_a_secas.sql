-- CRM EFAMEINSA · Migración 0249 · «Hacer seguimiento», a secas
--
-- Santos, 17-09-2026: la acción frecuente «Hacer seguimiento a la cotización»
-- pasa a decir solo «Hacer seguimiento». Se cambia donde nace el texto:
--   1. el catálogo de resultados (EVALUANDO_COTIZ lo sugiere),
--   2. emitir_cotizacion (0145), que lo pone al mandar la cotización,
--   3. lo que ya está agendado en oportunidades, para que Mi día lo muestre igual.

update catalogo_resultados_gestion
   set accion_sugerida = 'Hacer seguimiento'
 where codigo = 'EVALUANDO_COTIZ'
   and accion_sugerida = 'Hacer seguimiento a la cotización';

do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'emitir_cotizacion';

  v_nueva := replace(v_def,
    $viejo$then 'Hacer seguimiento a la cotización'$viejo$,
    $nuevo$then 'Hacer seguimiento'$nuevo$);
  if v_nueva = v_def then raise exception 'emitir_cotizacion: no se encontró el texto de la próxima acción'; end if;
  execute v_nueva;
end $$;

update oportunidades
   set proxima_accion = 'Hacer seguimiento'
 where proxima_accion = 'Hacer seguimiento a la cotización';
