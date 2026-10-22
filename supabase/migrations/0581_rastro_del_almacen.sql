-- 0581 · El rastro del almacén (Santos, 21-10: «quiero ver las acciones que
-- hizo al día… enfocado a sus actividades propias del área»).
--
-- Para armar «Lo que hizo el almacén hoy» hacían falta dos cosas que no
-- quedaban grabadas:
--   1. Las pruebas, los protocolos y las series se escriben en
--      `pedido_equipos`, y los protocolos de equipos en stock en
--      `protocolos_stock`: ninguna de las dos tablas tenía el disparador del
--      registro de acciones (0513). Se les pone el mismo.
--   2. La salida de planta (`almacen_registrar_salida`) no guardaba quién la
--      registró: de 25 salidas en 3 semanas, 18 sin `despachado_por`. Ahora
--      lo guarda, igual que «listo» y «agencia».
--
-- Igual que la 0429 salvo `despachado_por`. En la base local se corre como
-- supabase_admin.

do $$
declare t text;
begin
  foreach t in array array['pedido_equipos', 'protocolos_stock'] loop
    execute format('drop trigger if exists zy_registro_acciones on public.%I', t);
    execute format('create trigger zy_registro_acciones after insert or update or delete on public.%I for each row execute function public.registrar_accion()', t);
  end loop;
end $$;

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
         -- Quién la registró (0581): antes quedaba vacío y el día del almacén no se podía reconstruir.
         despachado_por = coalesce(despachado_por, auth.uid()),
         fecha_despacho = coalesce(fecha_despacho, p_fecha),
         salida_fotos = coalesce(salida_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         salida_nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), salida_nota),
         updated_at = now()
   where id = p_servicio;
end $$;
