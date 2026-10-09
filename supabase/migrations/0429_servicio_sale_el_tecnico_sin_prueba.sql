-- 0429 · En un servicio (revisión o mantenimiento) el almacén no prueba ni
-- embala: registra la salida del técnico.
-- Buzón, Lesly 09-10 (CONGREGACION MERCEDARIAS, revisión abierta desde un
-- caso): «se tendría que ver una regla que distinga servicios con equipos
-- porque es un servicio de revisión y me pide prueba de equipo; por ese
-- motivo sigue en pendiente de despacho como si no se hubiera ejecutado».
--
-- La salida pedía siempre 3 fotos de la máquina cargada. En un servicio no
-- sale ninguna máquina: sale el técnico, a veces con materiales o repuestos.
-- Las fotos pasan a ser opcionales solo cuando el pedido es un servicio; para
-- equipos, repuestos y lo demás sigue igual.

create or replace function public.almacen_registrar_salida(p_servicio uuid, p_fecha date, p_fotos jsonb, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La salida la registra el almacén';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  -- Sin apertura no sale nada del almacén (Carlos, 09-09); los pedidos
  -- anteriores al circuito, sin cierre en el CRM, siguen como estaban.
  if v_s.informe_cierre_id is not null and v_s.apertura_despacho_at is null then
    raise exception 'Sin apertura de despacho no sale nada del almacén: pídasela a postventa';
  end if;
  -- El servicio abierto desde un caso tampoco sale sin su apertura de servicio.
  if v_s.origen = 'caso' and v_s.apertura_despacho_at is null then
    raise exception 'Sin apertura de servicio no sale el técnico: pídasela a postventa';
  end if;
  -- Con saldo pendiente no sale sin autorización (0297). Si postventa ya
  -- registró la salida con autorización, esto solo suma las fotos.
  if v_s.despachado_at is null and v_s.despacho_autorizado_por is null and v_s.salida_autorizada_at is null
     and not coalesce(pago_cubre_el_despacho(p_servicio), true) then
    raise exception 'Este pedido tiene saldo pendiente: no sale hasta que gerencia u operaciones autorice la salida con su código';
  end if;
  if coalesce(v_s.tipo_pedido, 'equipo') not in ('revision', 'mantenimiento')
     and jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) < 3 then
    raise exception 'La salida se registra con las fotos de la máquina (mínimo 3: frente, lateral y posterior)';
  end if;
  update servicios_postventa
     set despachado_at = coalesce(despachado_at, (coalesce(p_fecha, (now() at time zone 'America/Lima')::date))::timestamptz + interval '12 hours'),
         fecha_despacho = coalesce(fecha_despacho, p_fecha),
         salida_fotos = coalesce(salida_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         salida_nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), salida_nota),
         updated_at = now()
   where id = p_servicio;
end $$;
