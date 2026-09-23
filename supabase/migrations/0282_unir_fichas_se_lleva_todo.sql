-- 0282 · UNIR DOS FICHAS SE LLEVA TODO (23-09).
--
-- fusionar_cuentas (22-09) movía expedientes, contactos, atenciones y pedidos,
-- pero no los informes de cierre, los equipos del parque, los informes
-- técnicos, el histórico de cotizaciones, los leads ni las visitas: quedaban
-- colgados de la ficha fusionada, que ya no se abre. Al unir Hortifrut
-- (Santos, 23-09) el cierre 027-2026 se habría quedado en la ficha vieja.
-- Se parte de la definición viva y solo se agregan los movimientos.

CREATE OR REPLACE FUNCTION public.fusionar_cuentas(p_origen uuid, p_destino uuid, p_pin text, p_motivo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_solicitante uuid := auth.uid();
  v_origen      cuentas%rowtype;
  v_destino     cuentas%rowtype;
  v_motivo      text;
  v_oportunidades integer := 0;
  v_contactos     integer := 0;
  v_atenciones    integer := 0;
  v_servicios     integer := 0;
begin
  if v_solicitante is null then raise exception 'Sesión no válida'; end if;

  if p_origen = p_destino then
    raise exception 'No se puede unir una ficha consigo misma';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué es el mismo cliente (mínimo una frase)';
  end if;
  v_motivo := btrim(p_motivo);

  select * into v_origen from cuentas where id = p_origen for update;
  if v_origen.id is null then raise exception 'La ficha de origen no existe'; end if;
  if v_origen.fusionada_en is not null then
    raise exception 'Esa ficha ya está fusionada';
  end if;
  -- Con RUC, el documento manda: no se une a ciegas una ficha que ya tiene su
  -- propia identidad fiscal. Si de verdad es un duplicado con RUC, se revisa
  -- a mano — es el caso raro, no el que este botón viene a resolver.
  if coalesce(nullif(btrim(v_origen.num_doc), ''), '') <> '' and v_origen.tipo_doc <> 'SIN_DOC' then
    raise exception 'Esa ficha ya tiene % %: no se une a ciegas, revísela a mano', v_origen.tipo_doc, v_origen.num_doc;
  end if;

  select * into v_destino from cuentas where id = p_destino for update;
  if v_destino.id is null then raise exception 'La ficha de destino no existe'; end if;
  if v_destino.fusionada_en is not null then
    raise exception 'Esa ficha de destino ya está fusionada en otra: elija la definitiva';
  end if;

  -- El código de operaciones: unir mueve carteras enteras, así que siempre lo
  -- pide, no solo cuando cambia de dueño (a diferencia de unir_lead_a_cuenta).
  perform validar_codigo_autorizacion(p_pin, 'operaciones');

  update oportunidades set cuenta_id = p_destino, updated_at = now() where cuenta_id = p_origen;
  get diagnostics v_oportunidades = row_count;

  update contactos set cuenta_id = p_destino where cuenta_id = p_origen;
  get diagnostics v_contactos = row_count;

  update atenciones set cuenta_id = p_destino, updated_at = now() where cuenta_id = p_origen;
  get diagnostics v_atenciones = row_count;

  update servicios_postventa set cuenta_id = p_destino, updated_at = now() where cuenta_id = p_origen;
  get diagnostics v_servicios = row_count;

  -- 0282 (23-09): unir también se lleva lo que cuelga de la ficha y antes
  -- quedaba en la vieja. Con Hortifrut, el cierre 027-2026 se habría quedado
  -- en la ficha fusionada y la definitiva no lo mostraba.
  update informes_cierre set cuenta_id = p_destino where cuenta_id = p_origen;
  update informes_servicio set cuenta_id = p_destino where cuenta_id = p_origen;
  update equipos_instalados set cuenta_id = p_destino where cuenta_id = p_origen;
  update cotizaciones_historicas set cuenta_id = p_destino where cuenta_id = p_origen;
  update leads set cuenta_id = p_destino where cuenta_id = p_origen;
  update soporte_tecnico set cuenta_id = p_destino where cuenta_id = p_origen;
  update visitas_planta set cuenta_id = p_destino where cuenta_id = p_origen;
  update aperturas_llamada set cuenta_id = p_destino where cuenta_id = p_origen;
  update asignaciones set cuenta_id = p_destino where cuenta_id = p_origen;
  update inventario_equipos set reservado_para = p_destino where reservado_para = p_origen;
  update wa_asignaciones_automaticas set cuenta_id = p_destino where cuenta_id = p_origen;
  update cuentas set cuenta_padre_id = p_destino where cuenta_padre_id = p_origen and id <> p_destino;
  update cuentas
     set ultima_venta_at = greatest(ultima_venta_at, v_origen.ultima_venta_at),
         cartera_desde = least(cartera_desde, v_origen.cartera_desde)
   where id = p_destino;

  update cuentas set fusionada_en = p_destino, updated_at = now() where id = p_origen;

  return format(
    'Unida a %s: %s expediente(s), %s contacto(s), %s atención(es) y %s pedido(s) movidos. %s',
    v_destino.razon_social, v_oportunidades, v_contactos, v_atenciones, v_servicios, v_motivo
  );
end;
$function$;
