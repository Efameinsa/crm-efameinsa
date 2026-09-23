-- 0290 · EL CIERRE SE CONVIERTE EN PEDIDO, Y CENTRAL LE PIDE LAS SERIES AL ALMACÉN
-- (reunión de Santos con el Ing. Carlos, 23-09-2026 14:58; decisiones del mismo día).
--
-- Carlos: «el almacén no debería ni siquiera recibir un correo… Central debería
-- simplemente darle clic, porque jala la información y se lo pide al almacén. El
-- almacén ingresa la serie, está bloqueada, ¡pum!, aparece acá. Y con eso paso
-- mi pedido, lo imprimo, se lo entrego a Finanzas, Finanzas me da la
-- liquidación, y pongo liquidación y pedido ejecutado».
-- Decisiones de Santos: (1) el pedido se puede ejecutar sin todas sus series;
-- (2) la liquidación la marca Central, viendo el PDF que sube Finanzas;
-- (3) el pedido de series al almacén va enlazado desde ya.
--
-- El pedido (servicios_postventa) y su lista de equipos se crean ANTES de los
-- checks con la misma liberar_pedido_postventa(…, false, false): sin marcar
-- nada ni avisar a nadie, y sin que las listas del área lo tomen por lanzado
-- (todas filtran «informe_cierre_id is null or pedido_ejecutado_at is not null»).

alter table public.servicios_postventa
  add column if not exists series_pedidas_at     timestamptz,
  add column if not exists series_pedidas_por    uuid references public.perfiles (id),
  add column if not exists liquidacion_adjunto   jsonb,
  add column if not exists liquidacion_subida_at timestamptz,
  add column if not exists liquidacion_subida_por uuid references public.perfiles (id);
comment on column public.servicios_postventa.series_pedidas_at is 'Cuándo Central le pidió las series al almacén (0290).';
comment on column public.servicios_postventa.liquidacion_adjunto is 'El PDF de la liquidación que sube Finanzas: {path, nombre} en el bucket adjuntos (0290).';

-- ── Central le pide las series al almacén ─────────────────────────────────
create or replace function public.pedir_series_al_almacen(p_servicio uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_faltan integer;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'Las series se las pide Central al almacén';
  end if;
  perform sembrar_equipos_del_pedido(p_servicio);
  select count(*) into v_faltan from pedido_equipos where servicio_id = p_servicio and serie is null;
  if v_faltan = 0 then raise exception 'Ese pedido ya tiene todas sus series'; end if;
  update servicios_postventa
     set series_pedidas_at = now(), series_pedidas_por = auth.uid(), updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
  return v_faltan;
end $$;

-- ── Corregir una serie ya puesta: con código y motivo, y queda escrito ─────
create or replace function public.corregir_serie_del_equipo(p_item uuid, p_serie text, p_pin text, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_it pedido_equipos%rowtype;
  v_autorizo uuid;
  v_nueva text := upper(btrim(coalesce(p_serie, '')));
begin
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escriba por qué se corrige la serie'; end if;
  if v_nueva = '' then raise exception 'Escriba la serie correcta'; end if;
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  if v_it.serie is null then raise exception 'Esa máquina todavía no tiene serie: regístrela normalmente'; end if;
  if exists (select 1 from equipos_instalados where upper(btrim(serie)) = v_nueva and id is distinct from v_it.equipo_id) then
    raise exception 'La serie % ya está en otra máquina del parque', v_nueva;
  end if;
  update equipos_instalados set serie = v_nueva, updated_at = now() where id = v_it.equipo_id;
  update pedido_equipos set serie = v_nueva where id = p_item;
  update servicios_postventa
     set observaciones = concat_ws(E'\n', observaciones,
           format('Serie corregida %s → %s (%s). Autorizó con código: %s.', v_it.serie, v_nueva, btrim(p_motivo),
                  coalesce((select nombre from perfiles where id = v_autorizo), '—')))
   where id = v_it.servicio_id;
  return v_it.equipo_id;
end $$;

-- ── Finanzas sube la liquidación; Central la ve y la marca ────────────────
create or replace function public.finanzas_subir_liquidacion(p_servicio uuid, p_path text, p_nombre text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if rol_actual() not in ('finanzas', 'gerencia', 'admin', 'operaciones') then
    raise exception 'La liquidación la sube Finanzas';
  end if;
  if nullif(btrim(coalesce(p_path, '')), '') is null then raise exception 'Falta el archivo de la liquidación'; end if;
  update servicios_postventa
     set liquidacion_adjunto = jsonb_build_object('path', p_path, 'nombre', coalesce(p_nombre, 'liquidacion.pdf')),
         liquidacion_subida_at = now(),
         liquidacion_subida_por = auth.uid(),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

revoke all on function public.pedir_series_al_almacen(uuid) from public;
revoke all on function public.corregir_serie_del_equipo(uuid, text, text, text) from public;
revoke all on function public.finanzas_subir_liquidacion(uuid, text, text) from public;
grant execute on function public.pedir_series_al_almacen(uuid) to authenticated;
grant execute on function public.corregir_serie_del_equipo(uuid, text, text, text) to authenticated;
grant execute on function public.finanzas_subir_liquidacion(uuid, text, text) to authenticated;

-- ── El candado en registrar_serie_del_equipo (definición viva + el candado) ─
CREATE OR REPLACE FUNCTION public.registrar_serie_del_equipo(p_item uuid, p_serie text, p_garantia_meses integer DEFAULT 24)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_it    record;
  v_s     record;
  v_serie text;
  v_base  date;
  v_eq    uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa o el almacén registran las series';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  v_serie := upper(btrim(coalesce(p_serie, '')));
  if v_serie = '' then raise exception 'Escriba la serie como se lee en la placa'; end if;
  -- EL CANDADO (Carlos, 23-09: «ingresa la serie, está bloqueada»). Una serie
  -- puesta no se pisa: se corrige con corregir_serie_del_equipo y el código.
  if v_it.serie is not null and upper(btrim(v_it.serie)) <> v_serie then
    raise exception 'Esa máquina ya tiene la serie %: para cambiarla use «Corregir serie» con el código de operaciones', v_it.serie;
  end if;
  select * into v_s from servicios_postventa where id = v_it.servicio_id;
  v_base := coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
    fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, proximo_mantenimiento, ubicacion,
    registrado_por, registrado_en, es_prueba)
  values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_it.descripcion, v_s.id, v_s.informe_cierre_id,
    v_s.fecha_confirmacion, v_base, v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24),
    case when v_base is null then null else (v_base + interval '4 months')::date end, v_s.ubicacion,
    auth.uid(), 'pedido', v_s.es_prueba)
  on conflict ((upper(btrim(serie)))) do update
    set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
        cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
        modelo_texto = coalesce(equipos_instalados.modelo_texto, excluded.modelo_texto),
        guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
        fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho)
  returning id into v_eq;

  update pedido_equipos set serie = v_serie, equipo_id = v_eq where id = p_item;
  return v_eq;
end;
$function$;
