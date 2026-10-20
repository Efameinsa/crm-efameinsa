-- ============================================================
-- CRM EFAMEINSA · Migración 0551 · Cerrar el pedido bien y dejar huella
-- ============================================================
-- Reunión de gerencia 20-10-2026, Brenda (PV2) cerrando PED-0022-2026
-- (Beneficencia de Huancayo):
--   · «tendría que jalarlo, no escribirlo» → las series se eligen de las del
--     pedido; se guardan en el cierre (cierre_series).
--   · «la garantía ya está corriendo desde que hemos entregado… que permita
--     seleccionar la fecha» → equipos_instalados.garantia_desde y el parámetro
--     p_fecha_entrega de subir_maquina_al_parque, que también manda en el
--     primer mantenimiento.
--   · «no debería dejar cerrar si no está el informe ejecutado… con PIN todo
--     se puede saltar» → sin puesta en marcha no se cierra salvo con código de
--     gerencia u operaciones y motivo (cierre_sin_puesta_*). La base lo frena
--     también, para que ningún otro botón lo salte. Exentos: repuestos sin
--     instalación, embalajes y accesorios, el cierre masivo del Excel (origen
--     excel) y lo que hace el sistema sin persona.
--   · El pedido queda enlazado a su expediente (oportunidad_id): estaban los
--     240 en blanco y el historial de un expediente no mostraba su pedido.
-- ============================================================

alter table equipos_instalados add column if not exists garantia_desde date;
comment on column equipos_instalados.garantia_desde is
  'Desde cuándo corre la garantía, si postventa la fijó al cerrar el pedido (0551). Manda sobre fecha_despacho.';

create or replace function public.calcular_garantia_equipo()
returns trigger language plpgsql as $function$
begin
  if new.garantia_meses is not null then
    new.garantia_hasta := (coalesce(new.garantia_desde, new.fecha_despacho, new.fecha_puesta_marcha, new.fecha_venta)
                           + (new.garantia_meses || ' months')::interval)::date;
  end if;
  return new;
end;
$function$;

alter table servicios_postventa
  add column if not exists cierre_series text[],
  add column if not exists garantia_desde date,
  add column if not exists cierre_sin_puesta_motivo text,
  add column if not exists cierre_sin_puesta_autorizo uuid references perfiles(id);

-- subir_maquina_al_parque con fecha de entrega (la firma de 4 se reemplaza por
-- una de 5 con default: las llamadas viejas siguen valiendo).
drop function if exists public.subir_maquina_al_parque(uuid, text, integer, integer);
create or replace function public.subir_maquina_al_parque(
  p_servicio uuid, p_serie text, p_garantia_meses integer default 24, p_meses_mantenimiento integer default 4,
  p_fecha_entrega date default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_s     record;
  v_serie text;
  v_base  date;
  v_eq    uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Solo postventa cierra el pedido y registra la máquina';
  end if;

  v_serie := upper(btrim(coalesce(p_serie, '')));
  if v_serie = '' then raise exception 'Escriba la serie como se lee en la placa'; end if;

  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;

  v_base := coalesce(p_fecha_entrega, (v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
    fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, garantia_desde, proximo_mantenimiento, ubicacion,
    registrado_por, registrado_en, es_prueba)
  values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_s.equipo, v_s.id, v_s.informe_cierre_id,
    v_s.fecha_confirmacion, coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, p_fecha_entrega),
    v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24), p_fecha_entrega,
    case when v_base is null then null
         else (v_base + make_interval(months => coalesce(p_meses_mantenimiento, 4)))::date end,
    v_s.ubicacion, auth.uid(), 'pedido', v_s.es_prueba)
  on conflict ((upper(btrim(serie)))) do update
    set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
        cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
        cliente_texto = coalesce(equipos_instalados.cliente_texto, excluded.cliente_texto),
        modelo_texto = coalesce(equipos_instalados.modelo_texto, excluded.modelo_texto),
        informe_cierre_id = coalesce(equipos_instalados.informe_cierre_id, excluded.informe_cierre_id),
        fecha_venta = coalesce(equipos_instalados.fecha_venta, excluded.fecha_venta),
        fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho),
        guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
        fecha_puesta_marcha = coalesce(excluded.fecha_puesta_marcha, equipos_instalados.fecha_puesta_marcha),
        garantia_meses = excluded.garantia_meses,
        garantia_desde = coalesce(excluded.garantia_desde, equipos_instalados.garantia_desde),
        proximo_mantenimiento = coalesce(excluded.proximo_mantenimiento, equipos_instalados.proximo_mantenimiento),
        ubicacion = coalesce(equipos_instalados.ubicacion, excluded.ubicacion)
  returning id into v_eq;

  update pedido_equipos set serie = v_serie, equipo_id = v_eq
   where id = (select id from pedido_equipos
                where servicio_id = v_s.id and (equipo_id = v_eq or coalesce(btrim(serie), '') = '')
                order by (equipo_id = v_eq) desc nulls last, id
                limit 1)
     and (equipo_id is null or equipo_id = v_eq);

  return v_eq;
end;
$function$;
revoke all on function public.subir_maquina_al_parque(uuid, text, integer, integer, date) from public;
grant execute on function public.subir_maquina_al_parque(uuid, text, integer, integer, date) to authenticated;

-- El freno en la base: cerrar sin puesta en marcha pide el motivo y quién lo
-- autorizó (el código lo valida la acción del servidor).
create or replace function public.frenar_cierre_sin_puesta()
returns trigger language plpgsql as $function$
declare
  v_tipo text := coalesce(new.tipo_pedido::text, 'equipo');
begin
  if new.cerrado_at is null or old.cerrado_at is not null then return new; end if;
  if auth.uid() is null then return new; end if;
  if coalesce(new.origen, '') = 'excel' then return new; end if;
  -- Anular el cierre (0162, 0490) cierra su pedido: no es una entrega.
  if exists (select 1 from informes_cierre i where i.id = new.informe_cierre_id and i.anulado_at is not null) then return new; end if;
  if v_tipo in ('embalaje', 'accesorio') then return new; end if;
  if v_tipo = 'repuesto' and coalesce(new.con_instalacion, false) = false then return new; end if;
  if new.puesta_en_marcha is not null then return new; end if;
  if coalesce(btrim(new.cierre_sin_puesta_motivo), '') <> '' and new.cierre_sin_puesta_autorizo is not null then return new; end if;
  raise exception 'Falta la puesta en marcha (o el informe del servicio). Llénela antes de cerrar, o cierre con el código de gerencia u operaciones y el motivo.';
end;
$function$;
drop trigger if exists zz_frenar_cierre_sin_puesta on servicios_postventa;
create trigger zz_frenar_cierre_sin_puesta before update of cerrado_at on servicios_postventa
  for each row execute function frenar_cierre_sin_puesta();

-- El pedido sabe a qué expediente pertenece: el del cierre.
create or replace function public.pedido_hereda_expediente()
returns trigger language plpgsql as $function$
begin
  if new.oportunidad_id is null and new.informe_cierre_id is not null then
    select oportunidad_id into new.oportunidad_id from informes_cierre where id = new.informe_cierre_id;
  end if;
  return new;
end;
$function$;
drop trigger if exists zb_pedido_hereda_expediente on servicios_postventa;
create trigger zb_pedido_hereda_expediente before insert or update of informe_cierre_id, oportunidad_id on servicios_postventa
  for each row execute function pedido_hereda_expediente();

update servicios_postventa s set oportunidad_id = i.oportunidad_id
  from informes_cierre i
 where i.id = s.informe_cierre_id and s.oportunidad_id is null and i.oportunidad_id is not null;

-- Los del CRM cuyo cierre tampoco sabe su expediente: el expediente ganado
-- (etapa venta) del mismo cliente más cercano a la fecha del cierre, si está a
-- menos de 60 días. Lo del Excel no se toca: no hay de dónde sacarlo.
update servicios_postventa s set oportunidad_id = x.op
  from (
    select distinct on (s2.id) s2.id, o.id as op
      from servicios_postventa s2
      join informes_cierre i on i.id = s2.informe_cierre_id
      join oportunidades o on o.cuenta_id = s2.cuenta_id and o.etapa = 'venta'
     where s2.oportunidad_id is null
       and abs(extract(epoch from (coalesce(o.cerrada_at, o.updated_at) - i.created_at))) < 60 * 86400
     order by s2.id, abs(extract(epoch from (coalesce(o.cerrada_at, o.updated_at) - i.created_at)))
  ) x
 where x.id = s.id;
