-- 0283 · EL CIERRE EMITIDO SE MUDA DE FICHA AL UNIR (23-09).
--
-- El candado de 0113 (bloquear_edicion_informe) no dejaba cambiar NADA de un
-- cierre emitido, tampoco su ficha: unir Hortifrut se deshizo entero con «El
-- informe 027-2026 ya fue emitido y no se modifica». Unir dos fichas del mismo
-- cliente es justamente el caso en que el cierre debe cambiar de ficha y de
-- nada más. fusionar_cuentas enciende app.fusionando_cuentas solo para su
-- transacción; el candado, con eso, deja pasar el cambio de cuenta_id y nada más.
-- Ambas funciones se parten de su definición viva.

CREATE OR REPLACE FUNCTION public.bloquear_edicion_informe()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(current_setting('app.anulando_cierre', true), '') = 'si'
     or coalesce(current_setting('app.corrigiendo_cierre', true), '') = 'si' then
    return new;  -- viene de anular_cierre(), que ya validó quién y con qué código
  end if;

  if old.emitido_at is not null and new.emitido_at is not null then
    -- 0283: al unir dos fichas del mismo cliente (fusionar_cuentas) el cierre
    -- cambia de ficha y de nada más; su contenido sigue intocable.
    if (to_jsonb(new) - 'adjuntos' - 'updated_at' - 'codigo' - 'venta_id'
          - case when coalesce(current_setting('app.fusionando_cuentas', true), '') = 'si' then 'cuenta_id' else '' end)
       is distinct from (to_jsonb(old) - 'adjuntos' - 'updated_at' - 'codigo' - 'venta_id'
          - case when coalesce(current_setting('app.fusionando_cuentas', true), '') = 'si' then 'cuenta_id' else '' end) then
      raise exception 'El informe % ya fue emitido y no se modifica', old.codigo;
    end if;

    if old.venta_id is not null and new.venta_id is distinct from old.venta_id then
      raise exception 'El informe % ya está atado a su venta y no se cambia', old.codigo;
    end if;

    if not (new.adjuntos @> old.adjuntos) then
      raise exception 'Del informe % los documentos solo se agregan: uno ya adjuntado no se quita ni se reemplaza', old.codigo;
    end if;
  end if;
  return new;
end;
$function$;

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
  perform set_config('app.fusionando_cuentas', 'si', true);
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
