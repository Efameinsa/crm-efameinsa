-- 0421 · La apertura de servicio sin cierre de venta elige con qué empresa sale.
-- Buzón, Rubí 09-10: «en la apertura que aparezca, como en las otras, la opción
-- de escoger con qué empresa realizar la apertura». La hoja toma la empresa de
-- la serie del cierre (EFAMEINSA u OPEN); la que nace de un caso no tiene
-- cierre y salía siempre como CORPORACIÓN EFAMEINSA S.A.
--
-- servicios_postventa.apertura_empresa: la empresa elegida a mano. Solo manda
-- cuando el pedido no tiene cierre; con cierre, manda la serie del cierre.

alter table public.servicios_postventa
  add column if not exists apertura_empresa text
  check (apertura_empresa is null or apertura_empresa in ('EFAMEINSA', 'OPEN'));

comment on column public.servicios_postventa.apertura_empresa is
  'Empresa con la que sale la apertura cuando el pedido no tiene cierre (0421). Con cierre manda informes_cierre.serie.';

drop function if exists public.apertura_desde_caso(uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, text);

create or replace function public.apertura_desde_caso(
  p_atencion uuid,
  p_tipo_pedido text,
  p_apertura_tipo text,
  p_fecha date,
  p_hora text,
  p_tecnico text,
  p_transporte text,
  p_direccion text,
  p_confirmo text,
  p_destino text,
  p_guia text default null,
  p_guia_detalle text default null,
  p_nota text default null,
  p_recibe_nombre text default null,
  p_recibe_telefono text default null,
  p_empresa text default 'EFAMEINSA'
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_a atenciones%rowtype;
  v_cliente text;
  v_id uuid;
  v_hora time := nullif(btrim(coalesce(p_hora, '')), '')::time;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'La apertura de servicio la emite postventa';
  end if;
  if p_tipo_pedido not in ('garantia', 'revision', 'mantenimiento') then raise exception 'El servicio es una garantía, una revisión o un mantenimiento'; end if;
  if p_apertura_tipo not in ('mantenimiento', 'puesta_marcha') then raise exception 'Ese no es uno de los formatos de apertura de servicio'; end if;
  if p_destino not in ('lima', 'provincia') then raise exception 'Diga si el servicio es en Lima o en provincia'; end if;
  if p_fecha is null then raise exception 'Diga el día del servicio'; end if;
  if nullif(btrim(coalesce(p_tecnico, '')), '') is null then raise exception 'Diga qué técnico va'; end if;
  if nullif(btrim(coalesce(p_direccion, '')), '') is null then raise exception 'Escriba dónde se hace el servicio, tal como lo confirmó el cliente'; end if;
  if nullif(btrim(coalesce(p_confirmo, '')), '') is null then raise exception 'Diga con quién del cliente confirmó la dirección'; end if;
  if coalesce(p_empresa, 'EFAMEINSA') not in ('EFAMEINSA', 'OPEN') then raise exception 'La apertura sale a nombre de EFAMEINSA o de OPEN'; end if;
  if p_guia is not null and p_guia not in ('traslado', 'materiales', 'repuestos', 'ambas') then raise exception 'Esa no es una de las guías que se pueden pedir'; end if;

  select * into v_a from atenciones where id = p_atencion for update;
  if v_a.id is null then raise exception 'Ese caso no existe'; end if;
  if v_a.cuenta_id is null then raise exception 'El caso no está en la ficha de un cliente: únalo a su ficha primero'; end if;
  if v_a.cerrado_at is not null then raise exception 'El caso ya está cerrado'; end if;
  if v_a.servicio_id is not null then raise exception 'Este caso ya tiene su apertura de servicio: ábrala desde su pedido'; end if;

  select coalesce(nullif(btrim(v_a.cliente_texto), ''), coalesce(c.num_doc || ' - ', '') || c.razon_social)
    into v_cliente from cuentas c where c.id = v_a.cuenta_id;

  insert into servicios_postventa (
    cuenta_id, cliente_texto, fecha_confirmacion, ubicacion, equipo, tipo_servicio, observaciones,
    origen, tipo_pedido, modalidad, responsable_id,
    direccion_entrega, direccion_verificada_at, direccion_verificada_con,
    apertura_tipo, apertura_fecha, apertura_hora, tecnico_asignado, transporte, apertura_nota,
    apertura_guia, apertura_guia_detalle, fecha_despacho, despacho_hora,
    apertura_despacho_at, apertura_despacho_por, es_prueba,
    recibe_nombre, recibe_telefono, apertura_empresa
  ) values (
    v_a.cuenta_id, v_cliente, (now() at time zone 'America/Lima')::date, btrim(p_direccion),
    coalesce(nullif(btrim(v_a.equipo_texto), ''), 'Servicio técnico'),
    case p_tipo_pedido when 'garantia' then 'GARANTÍA' when 'revision' then 'REVISIÓN' else 'MANTENIMIENTO' end,
    concat_ws(E'\n', 'Abierto desde un caso de postventa (sin cierre de venta).', nullif(btrim(coalesce(v_a.detalle, '')), '')),
    'caso', case p_tipo_pedido when 'mantenimiento' then 'mantenimiento' else 'revision' end, p_destino, auth.uid(),
    btrim(p_direccion), now(), btrim(p_confirmo),
    p_apertura_tipo, p_fecha, v_hora, btrim(p_tecnico), nullif(btrim(coalesce(p_transporte, '')), ''), nullif(btrim(coalesce(p_nota, '')), ''),
    p_guia, nullif(btrim(coalesce(p_guia_detalle, '')), ''), p_fecha, v_hora,
    now(), auth.uid(), v_a.es_prueba,
    coalesce(nullif(btrim(coalesce(p_recibe_nombre, '')), ''), btrim(p_confirmo)), nullif(btrim(coalesce(p_recibe_telefono, '')), ''),
    coalesce(p_empresa, 'EFAMEINSA')
  ) returning id into v_id;

  update atenciones set servicio_id = v_id, programada_at = coalesce(programada_at, (p_fecha + coalesce(v_hora, '09:00'::time)) at time zone 'America/Lima'),
         tecnico = coalesce(tecnico, btrim(p_tecnico)), updated_at = now()
   where id = p_atencion;
  return v_id;
end $$;

grant execute on function public.apertura_desde_caso(uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
