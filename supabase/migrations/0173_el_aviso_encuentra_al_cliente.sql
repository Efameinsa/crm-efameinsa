-- ============================================================
-- CRM EFAMEINSA · Migración 0173 · El aviso encuentra al cliente
-- ============================================================
-- Reportado por Central el 04-09 a las 17:55, con dos capturas: marcó los tres
-- destinos —Finanzas, postventa y el comercial— y el aviso llegó solo a
-- Finanzas. Los cuatro casos del día son iguales: Grupo Alimenticio San José,
-- V y P Ice, Sierra Travel y Pacha Nan Samay.
--
-- QUÉ PASABA. Para anotar el aviso en el historial del comercial o en el
-- pedido de postventa hay que saber de qué CLIENTE se trata, y la 0168 lo
-- resolvía de dos maneras: la ficha ya enlazada al contacto, o el número de
-- documento. Los cuatro contactos entraron sin documento y sin ficha
-- enlazada, así que no había a quién anotarle nada y el aviso avisaba de eso
-- —«no se pudo ubicar la ficha del cliente»— pero igual se iba solo a
-- Finanzas.
--
-- Y sin embargo los cuatro clientes ESTÁN en el CRM, con cierres emitidos esta
-- misma semana. Lo que faltaba no era el cliente: era buscarlo como lo busca
-- el resto del sistema.
--
-- CÓMO SE RESUELVE AHORA, en cuatro intentos y sin adivinar:
--   1. la ficha que ya trae el contacto,
--   2. el número de documento,
--   3. el teléfono normalizado,
--   4. la razón social, comparada sin puntos, espacios ni mayúsculas.
-- Los dos últimos solo valen cuando devuelven UNA sola ficha. Si devuelven
-- dos, el aviso no elige por su cuenta: lo dice, y de paso deja a la vista que
-- ese cliente está duplicado y hay que unirlo. Es la misma prudencia del
-- teléfono en la derivación (0144): el teléfono solo no manda a un cliente
-- distinto.
--
-- Y cuando encuentra la ficha, ENLAZA el contacto con ella. El próximo aviso
-- del mismo cliente ya no tiene que buscar, y Central ve el contacto atado a
-- su cliente en el resto de las pantallas.
--
-- La función se reescribe entera y no se parcha: nació ayer en la 0168, se
-- cambió hoy en la 0171 y el cuerpo se conoce completo. El cuidado de parchar
-- en vivo es para las funciones con historia.
-- ============================================================

create or replace function public.derivar_aviso(
  p_lead      uuid,
  p_finanzas  boolean default false,
  p_postventa boolean default false,
  p_comercial boolean default false,
  p_detalle   text    default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    'finanzas', p_finanzas
  );
end $function$;

comment on function public.derivar_aviso(uuid, boolean, boolean, boolean, text) is
  'Central manda un mismo aviso a Finanzas, postventa y el comercial. Ubica al cliente por ficha, documento, teléfono o razón social —los dos últimos solo si son inequívocos— y guarda lo que dejó escrito para poder revertirlo (0168, 0171, 0173).';
