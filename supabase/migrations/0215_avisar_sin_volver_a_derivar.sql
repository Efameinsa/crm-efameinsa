-- ============================================================
-- CRM EFAMEINSA · Migración 0215 · Avisarle al comercial sin volver a derivarle
-- ============================================================
-- Santos, 10-09, trayendo la duda de Central: «acaba de recibir un registro de
-- JORGE DONAIRES a la 1:06 pm y no sabe si asignar, porque ese cliente ya fue
-- gestionado por C5. Si lo deriva, C5 dice que ya lo gestionó y se molesta
-- porque le asignan de nuevo algo ya gestionado».
--
-- La bandeja ya le dice a Central lo que necesita saber —la cinta ámbar sale
-- con «Ya derivado. Coincide por documento con DONAIRES HUAMAN JORGE- HOTEL
-- IMPERIAL TAHUANTINSUYO — C5 · Katerine Tello, cotizado el 10/9/2026»—. Lo que
-- no tiene es una salida que sea la correcta:
--
--   · «Asignar» le llega a C5 como un contacto nuevo. Es lo que la molesta.
--   · «Descartar» miente: en el panel de gerencia, descartado significa que el
--     contacto NO procedía, y haría figurar a la campaña que trajo a este
--     cliente como una campaña que trae basura.
--   · «Ya está en el sistema» lo cierra en silencio: C5 nunca se entera de que
--     el cliente volvió a escribir, que es la única parte que le sirve.
--   · «Derivar aviso → el comercial del cliente» hace lo correcto… pero NO
--     AVISA. Anota la nota en el historial del cliente y nada más: el comercial
--     se entera cuando abre esa ficha, que puede ser mañana.
--
-- ESTA MIGRACIÓN CIERRA LAS DOS PUNTAS.
--
-- 1. `derivar_aviso` devuelve a quién le tocaba el aviso y en qué expediente
--    quedó anotado, para que la pantalla pueda mandarle la campanita. La nota
--    sigue entrando como `nota` y no como gestión: no infla los indicadores de
--    nadie, que es la razón por la que nació así (0168).
--
-- 2. `avisar_al_comercial_y_cerrar` hace de una sola vez lo que hoy son dos
--    pasos que además dejan el contacto en dos estados distintos: anota el
--    aviso en el expediente que el cliente YA tiene abierto y saca el contacto
--    de la bandeja como REPETIDO —`duplicado`, con su ficha—, que es la verdad:
--    llegó, procedió, y ya estaba registrado.
--
-- QUÉ NO HACE: no asigna, no abre expediente, no mueve cartera y no cuenta
-- como derivación. El comercial recibe «Su cliente volvió a escribir», no
-- «contacto nuevo».
--
-- SI EL CLIENTE NO TIENE EXPEDIENTE no hay dónde anotar y se dice con esas
-- palabras, en vez de cerrar el contacto y perder el dato: ahí Central deriva
-- como siempre.
-- ============================================================

-- El aviso que no vuelve a derivar: se lo anota a quien ya lo está atendiendo
-- y el contacto sale de la bandeja como repetido.
create or replace function public.avisar_al_comercial_y_cerrar(
  p_lead    uuid,
  p_cuenta  uuid,
  p_detalle text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead      leads%rowtype;
  v_cuenta    cuentas%rowtype;
  v_op        oportunidades%rowtype;
  v_detalle   text := btrim(coalesce(p_detalle, ''));
  v_actividad uuid;
  v_com       record;
begin
  if not (es_backoffice() or rol_actual() = 'central' or es_operaciones()) then
    raise exception 'Solo Central o gerencia avisan al comercial';
  end if;
  if length(v_detalle) < 10 then
    raise exception 'Escriba qué dijo el cliente: es lo único que va a leer el comercial';
  end if;

  select * into v_lead from leads where id = p_lead for update;
  if v_lead.id is null then
    raise exception 'Ese contacto no existe';
  end if;
  -- El mismo candado que las otras tres salidas de la bandeja: Central trabaja
  -- con dos pestañas abiertas y sin esto la pantalla cantaba el éxito de algo
  -- que no había pasado.
  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'Ese contacto ya salió de la bandeja (%). Recargue la página.', v_lead.estado;
  end if;

  select * into v_cuenta from cuentas where id = p_cuenta;
  if v_cuenta.id is null then
    raise exception 'Esa ficha de cliente no existe';
  end if;

  -- Dónde se anota: el mismo criterio que `derivar_aviso` (0168) — el
  -- expediente abierto más reciente y, si no hay ninguno abierto, el último
  -- que hubo. Los cascarones del Excel histórico quedan fuera.
  select * into v_op
    from oportunidades
   where cuenta_id = v_cuenta.id
     and etapa <> 'historico'
   order by (cerrada_at is null) desc, created_at desc
   limit 1;
  if v_op.id is null then
    raise exception 'Ese cliente no tiene ningún expediente donde anotar el aviso. Derívelo como siempre.';
  end if;

  -- NOTA, no gestión: el aviso de Central no cuenta como contacto del
  -- comercial con su cliente y no le mueve ningún indicador (0168).
  insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
  values (v_op.id, 'nota', '[Aviso de Central] ' || v_detalle, auth.uid(), now())
  returning id into v_actividad;

  -- Sale como REPETIDO y con su ficha. No como descartado: descartado es «no
  -- procedía», y este procedió — se derivó, se trabajó y se cotizó.
  update leads
     set estado     = 'duplicado',
         cuenta_id  = v_cuenta.id,
         updated_at = now()
   where id = p_lead;

  -- Queda en «Lo que derivé», con la misma fila que cualquier otro aviso, para
  -- que Central pueda revertirlo si se equivocó de cliente.
  insert into avisos_derivados (
    lead_id, a_finanzas, a_postventa, a_comercial, detalle,
    actividad_id, estado_anterior, area_anterior, derivado_por
  ) values (
    p_lead, false, false, true, v_detalle,
    v_actividad, v_lead.estado, v_lead.area_destino, auth.uid()
  );

  select p.id, p.nombre, p.codigo_comercial into v_com
    from perfiles p
   where p.id = coalesce(v_op.comercial_id, v_cuenta.comercial_id);

  return jsonb_build_object(
    'oportunidad',  v_op.id,
    'comercial_id', v_com.id,
    'comercial',    btrim(coalesce(v_com.codigo_comercial || ' · ', '') || coalesce(v_com.nombre, 'su comercial')),
    'cliente',      v_cuenta.razon_social,
    'codigo',       v_lead.codigo
  );
end;
$$;

comment on function public.avisar_al_comercial_y_cerrar(uuid, uuid, text) is
  'Anota en el expediente que el cliente ya tiene abierto que volvio a escribir, y saca el contacto de la bandeja como repetido. No asigna ni abre expediente. 0215.';

CREATE OR REPLACE FUNCTION public.derivar_aviso(p_lead uuid, p_finanzas boolean DEFAULT false, p_postventa boolean DEFAULT false, p_comercial boolean DEFAULT false, p_detalle text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead      leads;
  v_cuenta    cuentas;
  v_op        oportunidades;
  v_pedido    servicios_postventa;
  v_detalle   text := btrim(coalesce(p_detalle, ''));
  v_area      area_destino;
  v_hecho     text[] := '{}';
  v_falta     text[] := '{}';
  v_actividad uuid;
  v_servicio  uuid;
  v_linea     text;
  v_aviso     uuid;
  v_n         integer;
  v_clave     text;
begin
  if not (es_backoffice() or rol_actual() = 'central' or es_operaciones()) then
    raise exception 'Solo Central o gerencia derivan un aviso';
  end if;
  if not (p_finanzas or p_postventa or p_comercial) then
    raise exception 'Elija al menos un destino: Finanzas, postventa o el comercial';
  end if;
  if length(v_detalle) < 10 then
    raise exception 'Escriba qué avisó el cliente: es lo único que van a leer las áreas';
  end if;

  select * into v_lead from leads where id = p_lead;
  if not found then raise exception 'Ese contacto ya no está'; end if;

  -- ── De qué cliente estamos hablando ──────────────────────────────────
  if v_lead.cuenta_id is not null then
    select * into v_cuenta from cuentas where id = v_lead.cuenta_id;
  end if;

  if v_cuenta.id is null and nullif(btrim(coalesce(v_lead.num_doc, '')), '') is not null then
    select * into v_cuenta from cuentas where num_doc = btrim(v_lead.num_doc) limit 1;
  end if;

  if v_cuenta.id is null and nullif(coalesce(v_lead.telefono_normalizado, ''), '') is not null then
    select count(*) into v_n
      from cuentas cu
     where exists (select 1 from contactos k
                    where k.cuenta_id = cu.id
                      and k.telefono_normalizado = v_lead.telefono_normalizado);
    if v_n = 1 then
      select cu.* into v_cuenta
        from cuentas cu
       where exists (select 1 from contactos k
                      where k.cuenta_id = cu.id
                        and k.telefono_normalizado = v_lead.telefono_normalizado);
    elsif v_n > 1 then
      v_falta := array_append(v_falta,
        'ese teléfono está en ' || v_n || ' fichas distintas: hay que unirlas antes de que el aviso pueda llegar al comercial');
    end if;
  end if;

  if v_cuenta.id is null and nullif(btrim(coalesce(v_lead.razon_social, '')), '') is not null then
    v_clave := upper(regexp_replace(v_lead.razon_social, '[^A-Za-z0-9]', '', 'g'));
    select count(*) into v_n
      from cuentas cu
     where upper(regexp_replace(cu.razon_social, '[^A-Za-z0-9]', '', 'g')) = v_clave;
    if v_n = 1 then
      select cu.* into v_cuenta
        from cuentas cu
       where upper(regexp_replace(cu.razon_social, '[^A-Za-z0-9]', '', 'g')) = v_clave;
    elsif v_n > 1 then
      v_falta := array_append(v_falta,
        'ese nombre está en ' || v_n || ' fichas distintas: hay que unirlas antes de que el aviso pueda llegar al comercial');
    end if;
  end if;

  -- Encontrada la ficha, el contacto queda atado a ella: el próximo aviso ya
  -- no busca, y Central lo ve enlazado en el resto de las pantallas.
  if v_cuenta.id is not null and v_lead.cuenta_id is null then
    update leads set cuenta_id = v_cuenta.id where id = p_lead;
  end if;

  -- ── AL COMERCIAL: queda en el historial de su oportunidad ────────────
  if p_comercial then
    if v_cuenta.id is null then
      v_falta := array_append(v_falta, 'no se pudo ubicar la ficha del cliente: el aviso no entró en el historial de ningún comercial');
    else
      select * into v_op from oportunidades
       where cuenta_id = v_cuenta.id and etapa <> 'historico'
       order by (cerrada_at is null) desc, created_at desc
       limit 1;
      if v_op.id is null then
        v_falta := array_append(v_falta, 'el cliente no tiene ninguna oportunidad abierta donde anotar el aviso');
      else
        insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
        values (v_op.id, 'nota', '[Aviso de Central] ' || v_detalle, auth.uid(), now())
        returning id into v_actividad;
        v_hecho := array_append(v_hecho, 'anotado en el historial del cliente');
      end if;
    end if;
  end if;

  -- ── A POSTVENTA: se anota en el pedido en curso ──────────────────────
  if p_postventa then
    if v_cuenta.id is null then
      v_falta := array_append(v_falta, 'sin ficha de cliente no se pudo ubicar su pedido en postventa');
    else
      select * into v_pedido from servicios_postventa
       where cuenta_id = v_cuenta.id and cerrado_at is null and not completado
       order by created_at desc
       limit 1;
      if v_pedido.id is null then
        v_falta := array_append(v_falta, 'ese cliente no tiene ningún pedido abierto en postventa');
      else
        v_linea := to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI') ||
                   ' · Aviso de Central: ' || v_detalle;
        update servicios_postventa
           set observaciones = btrim(coalesce(observaciones, '') || chr(10) || v_linea),
               updated_at = now()
         where id = v_pedido.id;
        v_servicio := v_pedido.id;
        v_hecho := array_append(v_hecho, 'anotado en el pedido de postventa');
      end if;
    end if;
  end if;

  -- ── El contacto sale de la bandeja hacia el área que corresponda ─────
  v_area := case when p_finanzas then 'finanzas'::area_destino
                 when p_postventa then 'postventa'::area_destino
                 else 'comercial'::area_destino end;
  update leads
     set estado = 'derivado_area',
         area_destino = v_area,
         asignado_por = auth.uid(),
         asignado_at = now()
   where id = p_lead;

  if p_finanzas then v_hecho := array_append(v_hecho, 'derivado a Finanzas'); end if;

  insert into avisos_derivados (
    lead_id, a_finanzas, a_postventa, a_comercial, detalle,
    actividad_id, servicio_id, linea_pedido,
    estado_anterior, area_anterior, derivado_por
  ) values (
    p_lead, p_finanzas, p_postventa, p_comercial, v_detalle,
    v_actividad, v_servicio, v_linea,
    v_lead.estado, v_lead.area_destino, auth.uid()
  ) returning id into v_aviso;

  return jsonb_build_object(
    'aviso', v_aviso,
    'hecho', v_hecho,
    'falta', v_falta,
    'cliente', coalesce(v_cuenta.razon_social, v_lead.razon_social, v_lead.nombre_contacto),
    'documento', coalesce(v_cuenta.num_doc, v_lead.num_doc),
    'telefono', v_lead.telefono,
    'codigo', v_lead.codigo,
    'finanzas', p_finanzas,
    -- PARA QUE EL AVISO AVISE (0215). Hasta hoy esto anotaba la nota en el
    -- historial del cliente y nada más: el comercial se enteraba cuando abría
    -- esa ficha, que puede ser al día siguiente, y mientras tanto el cliente
    -- esperaba. Devolviendo a quién le tocaba y en qué expediente quedó, la
    -- pantalla puede mandarle la campanita — «Su cliente volvió a escribir»—
    -- sin que la nota deje de ser una nota.
    'oportunidad', v_op.id,
    'comercial_id', v_op.comercial_id
  );
end $function$
;
