-- 0333 · Postventa: PV es el área, cada persona tiene su usuario
--
-- Reunión con gerencia, 29-09-2026 ~14:40: «PV es el área, ese usuario no se
-- le da a nadie; PV1, PV2, PV3 y en adelante son de los usuarios. Cuando
-- alguien lo gestiona, es suyo». Hasta hoy toda derivación a postventa caía en
-- la cuenta PV, que usaba Rubí, y los casos de Gabriela aparecían «de Rubí».
--
-- La cuenta de Rubí pasa a PV3 (conserva su historial y su acceso) y se crea
-- aparte la cuenta del área con código PV (datos, no esta migración). Acá:
--   1. Un aviso para el área (campana) le llega a cada persona de postventa:
--      nadie inicia sesión como el área.
--   2. Un caso del área pasa a nombre de quien registra la primera gestión o
--      cotización en él.

create or replace function public.es_cuenta_area_postventa(p uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from perfiles where id = p and codigo_comercial = 'PV' and es_postventa);
$$;

-- 1. El aviso al área se reparte a PV1, PV2, PV3… (activos, no de práctica).
create or replace function public.notificacion_al_area_postventa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.user_id is not null and es_cuenta_area_postventa(new.user_id) then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    select p.id, new.tipo, new.titulo, new.cuerpo, new.url
      from perfiles p
     where p.es_postventa and p.activo and not coalesce(p.es_prueba, false)
       and p.codigo_comercial ~ '^PV[0-9]+$';
    return null;
  end if;
  return new;
end $$;

drop trigger if exists notificaciones_al_area_postventa on public.notificaciones;
create trigger notificaciones_al_area_postventa
  before insert on public.notificaciones
  for each row execute function public.notificacion_al_area_postventa();

-- 2. El caso del área pasa a quien lo gestiona primero.
create or replace function public.caso_del_area_pasa_a_quien_lo_gestiona()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- actividades trae realizada_por; cotizaciones, creada_por.
  v_quien uuid := coalesce(to_jsonb(new) ->> 'realizada_por', to_jsonb(new) ->> 'creada_por')::uuid;
begin
  if v_quien is null or new.oportunidad_id is null then return new; end if;
  update oportunidades o
     set comercial_id = v_quien, updated_at = now()
   where o.id = new.oportunidad_id
     and es_cuenta_area_postventa(o.comercial_id)
     and exists (select 1 from perfiles p where p.id = v_quien and p.es_postventa and not es_cuenta_area_postventa(p.id));
  return new;
end $$;

drop trigger if exists zy_caso_del_area_actividades on public.actividades;
create trigger zy_caso_del_area_actividades
  after insert on public.actividades
  for each row execute function public.caso_del_area_pasa_a_quien_lo_gestiona();

drop trigger if exists zy_caso_del_area_cotizaciones on public.cotizaciones;
create trigger zy_caso_del_area_cotizaciones
  after insert on public.cotizaciones
  for each row execute function public.caso_del_area_pasa_a_quien_lo_gestiona();

revoke all on function public.es_cuenta_area_postventa(uuid) from public, anon;
grant execute on function public.es_cuenta_area_postventa(uuid) to authenticated, service_role;
revoke all on function public.notificacion_al_area_postventa() from public, anon;
revoke all on function public.caso_del_area_pasa_a_quien_lo_gestiona() from public, anon;
