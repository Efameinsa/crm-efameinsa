-- EL PEDIDO TRAE EL INFORME DE LA VIDEOLLAMADA DE PREINSTALACIÓN COMPLETO
-- (28-09, KARINA SAAVEDRA HOSPEDAJE E.I.R.L., pedido PED-0002-2026).
--
-- Postventa reclamó que el pedido «no está jalando el informe técnico». Sí lo
-- traía, pero cortado: al revisar la apertura (0281) y al corregir su tipo
-- (0311) se copiaba al paso «Videollamada de preinstalación hecha» solo
-- `left(texto, 500)`. El informe de Karina tiene 794 caracteres y se perdió
-- justo el final —la alimentación eléctrica, los tomacorrientes Schuko y
-- «Cotizar tomacorrientes Schuko»—, que es lo que el técnico tiene que llevar.
-- El de AMAZONAS GRANDEZ (1 352) perdía toda la nota de los siete pisos sin
-- ascensor. Y como iba con `coalesce`, si postventa corregía la hoja
-- después, el pedido se quedaba con la primera versión.
--
-- Ahora se copia entero y se actualiza con cada revisión, salvo que alguien
-- haya escrito a mano otra nota en el pedido (esa no se pisa). Las dos
-- funciones son las vivas de la base con solo esa línea cambiada. Al final se
-- rellenan los pedidos que quedaron cortados.
CREATE OR REPLACE FUNCTION public.revisar_apertura_llamada(p_id uuid, p_informe_cliente text, p_enviada boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a aperturas_llamada%rowtype;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La revisión es de postventa';
  end if;
  select * into a from aperturas_llamada where id = p_id and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found or a.anulada_at is not null then raise exception 'Esa apertura no existe o está anulada'; end if;
  if a.informe_at is null then raise exception 'El almacén todavía no subió su informe'; end if;
  if nullif(btrim(coalesce(p_informe_cliente, '')), '') is null then raise exception 'Falta el texto para el cliente'; end if;
  update aperturas_llamada
     set informe_cliente = btrim(p_informe_cliente),
         revisada_at = coalesce(revisada_at, now()),
         revisada_por = coalesce(revisada_por, auth.uid()),
         enviada_cliente_at = case when p_enviada then coalesce(enviada_cliente_at, now()) else enviada_cliente_at end
   where id = p_id;
  if a.servicio_id is not null and a.tipo = 'videollamada_preinstalacion' then
    update servicios_postventa
       set preinstalacion_ok_at = coalesce(preinstalacion_ok_at, now()),
           preinstalacion_nota = case
             when preinstalacion_nota is null
               or preinstalacion_nota = left(btrim(coalesce(a.informe_cliente, '')), 500)
               or preinstalacion_nota = btrim(coalesce(a.informe_cliente, ''))
             then btrim(p_informe_cliente) else preinstalacion_nota end,
           updated_at = now()
     where id = a.servicio_id;
  end if;
end $function$

;

CREATE OR REPLACE FUNCTION public.corregir_tipo_apertura(p_id uuid, p_tipo text, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a aperturas_llamada%rowtype;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'El tipo lo corrige postventa';
  end if;
  if p_tipo not in ('videollamada_preinstalacion', 'videollamada_puesta_marcha', 'soporte_videollamada', 'atencion_in_situ', 'revision') then
    raise exception 'Tipo de apertura desconocido';
  end if;
  select * into a from aperturas_llamada
   where id = p_id and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if not found or a.anulada_at is not null then raise exception 'Esa apertura no existe o está anulada'; end if;
  if a.tipo = p_tipo then raise exception 'La apertura ya es de ese tipo'; end if;

  update aperturas_llamada
     set tipo = p_tipo,
         cambios = cambios || jsonb_build_array(jsonb_build_object(
           'que', 'tipo',
           'de', a.tipo,
           'a', p_tipo,
           'motivo', nullif(btrim(coalesce(p_motivo, '')), ''),
           'por', auth.uid(),
           'at', now()))
   where id = p_id;

  -- El informe de servicio que salió de esta apertura lleva el tipo y el
  -- asunto del tipo (los mismos que InformeSoporteApertura). Conserva su número.
  if a.informe_servicio_id is not null then
    update informes_servicio
       set tipo = (case p_tipo
                    when 'videollamada_puesta_marcha' then 'puesta_en_marcha'
                    when 'atencion_in_situ' then 'tecnico'
                    when 'revision' then 'revision'
                    else 'llamada' end)::tipo_servicio_pv,
           asunto = case p_tipo
                    when 'videollamada_preinstalacion' then 'Video llamada'
                    when 'videollamada_puesta_marcha' then 'Video llamada · puesta en marcha'
                    when 'soporte_videollamada' then 'Video llamada · soporte técnico'
                    when 'atencion_in_situ' then 'Atención técnica en el local del cliente'
                    else 'Revisión del equipo' end,
           updated_at = now()
     where id = a.informe_servicio_id;
  end if;

  -- El paso de preinstalación del pedido: si ya se revisó, queda como lo
  -- habría dejado la revisión con el tipo correcto.
  if a.servicio_id is not null and a.revisada_at is not null then
    if p_tipo = 'videollamada_preinstalacion' then
      update servicios_postventa
         set preinstalacion_ok_at = coalesce(preinstalacion_ok_at, a.revisada_at),
             preinstalacion_nota = coalesce(preinstalacion_nota, nullif(btrim(coalesce(a.informe_cliente, '')), '')),
             updated_at = now()
       where id = a.servicio_id;
    elsif a.tipo = 'videollamada_preinstalacion' then
      -- Solo se deshace lo que marcó esta misma apertura, no una preinstalación
      -- que se registró por otro lado.
      update servicios_postventa
         set preinstalacion_ok_at = null, preinstalacion_nota = null, updated_at = now()
       where id = a.servicio_id
         and abs(extract(epoch from preinstalacion_ok_at - a.revisada_at)) < 1;
    end if;
  end if;
end $function$

;

-- Los pedidos que quedaron con la copia cortada: se completan con la hoja
-- revisada de su apertura.
update servicios_postventa s
   set preinstalacion_nota = btrim(a.informe_cliente), updated_at = now()
  from aperturas_llamada a
 where a.servicio_id = s.id
   and a.tipo = 'videollamada_preinstalacion'
   and a.anulada_at is null
   and a.informe_cliente is not null
   and length(btrim(a.informe_cliente)) > 500
   and s.preinstalacion_nota = left(btrim(a.informe_cliente), 500);
