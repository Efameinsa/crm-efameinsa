-- ============================================================
-- CRM EFAMEINSA · Migración 0108 · Enviar la cotización mueve el flujo
-- ============================================================
-- Reportado por C4 el 28-08, con seis presupuestos en la mano: «ella ya cotizó
-- pero no le aparece como cotizado en una de sus vistas; si ya hizo la
-- cotización debería moverse en el kanban también como cotizado, y en su agenda
-- le sale "enviar la cotización" cuando ya se le envió».
--
-- Las dos cosas salen del mismo sitio: `emitir_cotizacion()` marcaba el
-- documento como enviado y no tocaba nada más de la oportunidad.
--
-- 1 · LA ETAPA. La migración 0069 hizo que «cotizada» llegara al ENVIAR y no al
--     crear el borrador —eso sigue igual—, pero solo avanzaba desde 'asignada' y
--     'filtrada' para no retroceder una oportunidad ya negociada. El agujero:
--     registrar una gestión antes de cotizar deja la oportunidad en
--     'seguimiento', que en el tablero va DESPUÉS de 'Cotizada'. Resultado: la
--     comercial cotiza y la tarjeta se queda en Seguimiento para siempre.
--     Ahora 'seguimiento' también avanza a 'cotizada' —es el hecho: el cliente
--     tiene el documento—. 'potencial' y 'venta' no se tocan: ahí la
--     negociación ya está más adelante y volverla atrás borraría información
--     (y la sacaría del cuadro de potenciales de la semana).
--
-- 2 · LA AGENDA. La próxima acción vive en la oportunidad y nadie la cerraba:
--     «Enviar la cotización» seguía venciendo un día tras otro aunque el
--     presupuesto ya hubiera salido. Al enviar, esa tarea —y solo esa— se
--     reemplaza por el paso natural, «Hacer seguimiento a la cotización», para
--     el día hábil siguiente. Si la comercial había anotado otra cosa, se
--     respeta lo que ella escribió.

create or replace function emitir_cotizacion(p_cotizacion_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cot         cotizaciones%rowtype;
  v_correlativo integer;
  v_codigo      text;
  v_hoy         date := (now() at time zone 'America/Lima')::date;
  v_siguiente   date;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  if not exists (
    select 1 from oportunidades o
    where o.id = v_cot.oportunidad_id
      and (o.comercial_id = auth.uid() or es_backoffice())
  ) then
    raise exception 'Solo el comercial dueño de la oportunidad puede enviarla';
  end if;

  if v_cot.estado <> 'borrador' or v_cot.enviada_at is not null then
    raise exception 'Esta cotización ya fue enviada al cliente';
  end if;

  if v_cot.estado_aprobacion = 'pendiente_gerencia' then
    raise exception 'Gerencia todavía no aprueba los precios de esta cotización';
  end if;
  if v_cot.estado_aprobacion = 'rechazada_gerencia' then
    raise exception 'Gerencia rechazó los precios de esta cotización; corríjala antes de enviarla';
  end if;

  if not exists (select 1 from cotizacion_items where cotizacion_id = p_cotizacion_id) then
    raise exception 'La cotización necesita al menos un equipo';
  end if;

  v_correlativo := siguiente_correlativo_anual(v_cot.serie::text);
  v_codigo := 'Presu_' || v_correlativo::text || '-' ||
              to_char((now() at time zone 'America/Lima'), 'YY');

  update cotizaciones
     set correlativo = v_correlativo,
         codigo      = v_codigo,
         estado      = 'enviada',
         enviada_at  = now()
   where id = p_cotizacion_id;

  -- El día hábil siguiente: acá se trabaja de lunes a sábado, así que lo único
  -- que se salta es el domingo.
  v_siguiente := v_hoy + 1;
  if extract(dow from v_siguiente) = 0 then v_siguiente := v_siguiente + 1; end if;

  update oportunidades set
    -- Recién ahora el prospecto está cotizado: tiene el documento en la mano.
    etapa = case
      when etapa in ('asignada', 'filtrada', 'seguimiento') then 'cotizada'::etapa_oportunidad
      else etapa
    end,
    -- «Enviar la cotización» ya está hecho: la agenda pasa al seguimiento.
    proxima_accion = case
      when proxima_accion ~* 'enviar.*cotiza' then 'Hacer seguimiento a la cotización'
      else proxima_accion
    end,
    proxima_accion_at = case
      when proxima_accion ~* 'enviar.*cotiza' then v_siguiente
      else proxima_accion_at
    end,
    updated_at = now()
  where id = v_cot.oportunidad_id;

  return v_codigo;
end;
$fn$;

comment on function emitir_cotizacion(uuid) is
  'Asigna el correlativo, marca la cotización como enviada y mueve la oportunidad: etapa «cotizada» y la agenda al seguimiento (migración 0108).';

-- ------------------------------------------------------------
-- Lo ya ocurrido: las que se enviaron antes de esta corrección.
-- ------------------------------------------------------------
-- Oportunidades con una cotización ENVIADA que se quedaron en «seguimiento»
-- —el caso de C4— y las que siguen pidiendo enviar un presupuesto que ya salió.
-- Solo lo cotizado DESDE EL CRM (los últimos 30 días): en lo importado del
-- Excel la etapa la puso el histórico de la comercial y no se toca.
update oportunidades o set
  etapa = 'cotizada'::etapa_oportunidad,
  updated_at = now()
where o.etapa = 'seguimiento'
  and exists (
    select 1 from cotizaciones c
     where c.oportunidad_id = o.id and c.enviada_at > now() - interval '30 days'
  );

update oportunidades o set
  proxima_accion = 'Hacer seguimiento a la cotización',
  updated_at = now()
where o.proxima_accion ~* 'enviar.*cotiza'
  and exists (select 1 from cotizaciones c where c.oportunidad_id = o.id and c.enviada_at is not null);
