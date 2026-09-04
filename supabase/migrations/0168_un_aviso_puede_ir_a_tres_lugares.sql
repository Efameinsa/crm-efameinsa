-- ============================================================
-- CRM EFAMEINSA · Migración 0168 · Un aviso puede ir a tres lugares a la vez
-- ============================================================
-- Reunión del 04-09 (grabación 10:48), con Central delante. Manda sobre la
-- 0133, que dejó una sola salida hacia otra área (Finanzas).
--
--   «Habíamos indicado que todo eso se tenía que registrar en el ERP. La idea
--    es que se registre en el CRM todo lo que esté relacionado con el cliente
--    (…) Yo hice un cierre, entregué todo, pero pagó solamente el 50%, y
--    mañana me va a cancelar. Llega el día siguiente, ya me canceló, y yo
--    tengo que avisar. Eso del ERP no es necesario, hacerlo simplemente en el
--    CRM. Y esa información va a ir, uno a Finanzas, que ya está; dos al mismo
--    comercial, para que le cargue en su historial; y tres a postventa.»
--
--   «En cualquier registro que haga la central, la central debe tener esas
--    tres alternativas. Puede elegir una o las tres.»
--
-- QUÉ HACE CADA DESTINO
--   · Finanzas   → el contacto sale del circuito comercial (derivado_area) y
--                  la pantalla abre el WhatsApp de Tesorería, como en la 0133.
--   · Comercial  → el aviso entra como actividad en la oportunidad viva del
--                  cliente: aparece en el historial del dueño de la cartera,
--                  que es lo que pidió Carlos («para que le cargue a su CRM»).
--   · Postventa  → el aviso se anota en el pedido en curso de ese cliente, que
--                  es donde postventa decide si despacha. Si no hay pedido, se
--                  informa y no se inventa uno.
--
-- La actividad se registra como `nota`, no como llamada: no es una gestión
-- comercial de nadie y no debe inflar los indicadores del comercial (la misma
-- razón por la que nació la 0133).
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

  -- El cliente: por la ficha ya enlazada, o por documento.
  select * into v_cuenta from cuentas
   where (v_lead.cuenta_id is not null and id = v_lead.cuenta_id)
      or (v_lead.cuenta_id is null and v_lead.num_doc is not null and num_doc = v_lead.num_doc)
   limit 1;

  -- AL COMERCIAL: queda en el historial de su oportunidad.
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
        values (v_op.id, 'nota', '[Aviso de Central] ' || v_detalle, auth.uid(), now());
        v_hecho := array_append(v_hecho, 'anotado en el historial del cliente');
      end if;
    end if;
  end if;

  -- A POSTVENTA: se anota en el pedido en curso.
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
        update servicios_postventa
           set observaciones = btrim(coalesce(observaciones, '') || chr(10) ||
                 to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI') ||
                 ' · Aviso de Central: ' || v_detalle),
               updated_at = now()
         where id = v_pedido.id;
        v_hecho := array_append(v_hecho, 'anotado en el pedido de postventa');
      end if;
    end if;
  end if;

  -- El contacto sale de la bandeja hacia el área que corresponda.
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

  return jsonb_build_object(
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
  'Central manda un mismo aviso a Finanzas, a postventa y al comercial dueño del cliente, en cualquier combinación (Carlos, 04-09 10:48).';

-- ============================================================
-- Y los rechazados se pueden retomar
-- ============================================================
--   «Está bien que se rechace, pero que se vea con los rechazados (…) porque
--    cualquier eventualidad la podemos retomar. Ya llegó la cola, hoy día lo
--    vamos a atender: ahora sí, redirecciónalo a Finanzas, o redirecciónalo al
--    comercial que lo está atendiendo. Que te permita verlo y retomarlo. Una
--    zona donde estén todos los acumulados.»
--
-- Retomar devuelve el contacto a la bandeja tal como llegó: vuelve a
-- pendiente_triaje y desde ahí Central lo reparte con las salidas de siempre.
create or replace function public.retomar_lead(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead leads;
begin
  if not (es_backoffice() or rol_actual() = 'central' or es_operaciones()) then
    raise exception 'Solo Central o gerencia retoman un contacto rechazado';
  end if;

  select * into v_lead from leads where id = p_lead;
  if not found then raise exception 'Ese contacto ya no está'; end if;
  if v_lead.estado not in ('descartado', 'duplicado', 'derivado_area') then
    raise exception 'Ese contacto no está rechazado: está %', v_lead.estado;
  end if;

  -- La columna area_destino no admite nulo: un contacto en la bandeja vuelve a ser
  -- del circuito comercial hasta que Central decida otra cosa.
  update leads
     set estado = 'pendiente_triaje',
         area_destino = 'comercial',
         asignado_a = null,
         asignado_at = null,
         asignado_por = auth.uid()
   where id = p_lead;

  return jsonb_build_object('codigo', v_lead.codigo, 'estado_anterior', v_lead.estado);
end $function$;

comment on function public.retomar_lead(uuid) is
  'Devuelve a la bandeja de Central un contacto descartado, duplicado o derivado a otra área, para volver a repartirlo (Carlos, 04-09 10:48).';
