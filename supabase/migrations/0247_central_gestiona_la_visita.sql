-- ============================================================
-- CRM EFAMEINSA · Migración 0247 · Central gestiona la visita
-- ============================================================
-- Lo que enseñó Catherine el 15-09 (capítulo 1 de la inducción, «La visita
-- agendada»): el comercial pregunta con quién viene el cliente y manda a
-- Central nombre y DNI de CADA persona, la cotización, si viene a ver una
-- máquina en especial (hay que quitarle el film), si hay que abrir la
-- lavandería modelo, prender el televisor y pedir el Infocorp. «Hasta aquí
-- llega tu gestión. Luego se encarga Central»: Central avisa a vigilancia,
-- presiona a logística para que abran y quiten el film, saca el Infocorp y lo
-- devuelve, avisa cuando el cliente llegó, y después de la visita pide que
-- vuelvan a embalar lo que se abrió. Todo eso vivía en correos y WhatsApp;
-- acá queda como una lista de checks sobre la visita.
-- ============================================================
alter table public.visitas_planta
  add column if not exists acompanantes jsonb not null default '[]'::jsonb,
  add column if not exists equipo_a_ver text,
  add column if not exists quitar_film boolean not null default false,
  add column if not exists infocorp_enviado_at timestamptz,
  add column if not exists showroom_listo_at timestamptz,
  add column if not exists film_retirado_at timestamptz,
  add column if not exists tv_listo_at timestamptz,
  add column if not exists llego_at timestamptz,
  add column if not exists no_vino_at timestamptz,
  add column if not exists reembalado_at timestamptz,
  add column if not exists notas_central text;
comment on column public.visitas_planta.acompanantes is 'Quiénes más vienen: [{nombre, dni}] (0247). Vigilancia pide el DNI de todos.';
comment on column public.visitas_planta.equipo_a_ver is 'La máquina que viene a ver, para que logística la ubique y le quite el film (0247).';

-- Un solo check por vez, por quien corresponde. Central marca todo; almacén
-- marca lo suyo (lavandería, film, TV, re-embalado); postventa puede marcar
-- la llegada si recibió al cliente.
create or replace function public.marcar_visita(p_visita uuid, p_que text, p_puesto boolean default true, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_v visitas_planta%rowtype;
  v_central boolean := coalesce(rol_actual() in ('central', 'gerencia', 'admin', 'operaciones'), false);
  v_almacen boolean := coalesce(es_almacen(), false) or coalesce(es_operaciones(), false);
  v_valor timestamptz := case when p_puesto then now() else null end;
  v_nombre text;
begin
  select * into v_v from visitas_planta where id = p_visita;
  if v_v.id is null then raise exception 'Esa visita no existe'; end if;

  if p_que in ('impreso', 'infocorp', 'llego', 'no_vino') and not v_central and not coalesce(puede_postventa(), false) then
    raise exception 'Eso lo marca Central';
  end if;
  if p_que in ('showroom', 'film', 'tv', 'reembalado') and not v_central and not v_almacen then
    raise exception 'Eso lo marca el almacén o Central';
  end if;

  update visitas_planta set
    impreso_at         = case when p_que = 'impreso' then v_valor else impreso_at end,
    impreso_por        = case when p_que = 'impreso' then (case when p_puesto then auth.uid() else null end) else impreso_por end,
    infocorp_enviado_at = case when p_que = 'infocorp' then v_valor else infocorp_enviado_at end,
    showroom_listo_at  = case when p_que = 'showroom' then v_valor else showroom_listo_at end,
    film_retirado_at   = case when p_que = 'film' then v_valor else film_retirado_at end,
    tv_listo_at        = case when p_que = 'tv' then v_valor else tv_listo_at end,
    llego_at           = case when p_que = 'llego' then v_valor else llego_at end,
    no_vino_at         = case when p_que = 'no_vino' then v_valor else no_vino_at end,
    reembalado_at      = case when p_que = 'reembalado' then v_valor else reembalado_at end,
    notas_central      = case when nullif(btrim(coalesce(p_nota, '')), '') is null then notas_central
                              else concat_ws(E'\n', notas_central, format('%s: %s', to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI'), btrim(p_nota))) end
  where id = p_visita;

  -- «Gerencia te notifica directamente: Moisés, llegó tu visita. Baja a
  -- atenderlo» (Catherine). Acá lo hace el CRM en cuanto Central marca la llegada.
  if p_que = 'llego' and p_puesto and v_v.registrado_por <> auth.uid() then
    perform crear_notificacion(v_v.registrado_por, null, 'visita_planta',
      format('Llegó su visita · %s', v_v.persona),
      format('%s%s ya está en la puerta. Baje a recibirlo.', v_v.persona, case when v_v.empresa is not null then ' (' || v_v.empresa || ')' else '' end),
      '/central/visitas');
  end if;
  -- Y al pedir que vuelvan a embalar, el almacén se entera.
  if p_que = 'reembalado' and not p_puesto then null; end if;
  if p_que = 'film' and p_puesto and v_v.registrado_por <> auth.uid() then
    perform crear_notificacion(v_v.registrado_por, null, 'visita_planta',
      format('Lista la máquina para la visita de %s', v_v.persona),
      format('%s: film retirado. Baje antes a ubicarla y corroborar la placa.', coalesce(v_v.equipo_a_ver, 'el equipo')),
      '/central/visitas');
  end if;
end $$;
revoke all on function public.marcar_visita(uuid, text, boolean, text) from public;
grant execute on function public.marcar_visita(uuid, text, boolean, text) to authenticated;

-- El registro admite acompañantes, el equipo a ver y el film.
drop function if exists public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid, boolean, text, boolean, boolean);
create or replace function public.registrar_visita_planta(
  p_cuenta uuid,
  p_empresa text,
  p_ruc text,
  p_persona text,
  p_dni text,
  p_telefono text,
  p_motivo text,
  p_fecha date,
  p_hora time,
  p_oportunidad uuid default null,
  p_showroom boolean default false,
  p_cotizacion_ref text default null,
  p_prender_tv boolean default false,
  p_infocorp boolean default false,
  p_acompanantes jsonb default '[]'::jsonb,
  p_equipo_a_ver text default null,
  p_quitar_film boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid := auth.uid();
  v_id uuid;
  v_nombre text;
  v_cuando text;
  v_prueba boolean := coalesce(es_cuenta_prueba(), false);
  v_n int := jsonb_array_length(coalesce(p_acompanantes, '[]'::jsonb));
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if length(btrim(coalesce(p_empresa, ''))) < 2 then raise exception 'Diga qué empresa viene'; end if;
  if length(btrim(coalesce(p_persona, ''))) < 3 then raise exception 'Diga quién viene: vigilancia lo pide por nombre'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga para qué viene'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de la visita'; end if;
  if p_fecha < (now() at time zone 'America/Lima')::date then raise exception 'La visita no puede ser en una fecha ya pasada'; end if;

  insert into visitas_planta (cuenta_id, oportunidad_id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_por, es_prueba, showroom, cotizacion_ref, prender_tv, infocorp, acompanantes, equipo_a_ver, quitar_film)
  values (p_cuenta, p_oportunidad, btrim(p_empresa), nullif(btrim(coalesce(p_ruc, '')), ''), btrim(p_persona),
          nullif(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g'), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
          btrim(p_motivo), p_fecha, p_hora, v_quien, v_prueba, coalesce(p_showroom, false),
          nullif(btrim(coalesce(p_cotizacion_ref, '')), ''), coalesce(p_prender_tv, false), coalesce(p_infocorp, false),
          coalesce(p_acompanantes, '[]'::jsonb), nullif(btrim(coalesce(p_equipo_a_ver, '')), ''), coalesce(p_quitar_film, false))
  returning id into v_id;

  select coalesce(nombre, 'alguien') into v_nombre from perfiles where id = v_quien;
  v_cuando := to_char(p_fecha, 'DD/MM') || case when p_hora is not null then ' ' || to_char(p_hora, 'HH24:MI') else '' end;

  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select p.id, 'visita_planta',
         format('Visita %s el %s · %s', case when coalesce(p_showroom, false) then 'al showroom' else 'a planta' end, v_cuando, btrim(p_empresa)),
         format('Viene %s%s%s. Motivo: %s.%s%s%s%s Lo registró %s. Imprímalo para vigilancia.',
                btrim(p_persona), case when p_dni is not null then ' (DNI ' || p_dni || ')' else '' end,
                case when v_n > 0 then format(' con %s acompañante(s)', v_n) else '' end,
                btrim(p_motivo),
                case when coalesce(p_showroom, false) then ' Abrir la lavandería.' else '' end,
                case when coalesce(p_prender_tv, false) then ' Prender el TV.' else '' end,
                case when coalesce(p_quitar_film, false) then format(' Quitar el film a %s.', coalesce(p_equipo_a_ver, 'la máquina')) else '' end,
                case when coalesce(p_infocorp, false) then ' Se solicita Infocorp.' else '' end,
                v_nombre),
         '/central/visitas'
    from perfiles p
   where p.rol = 'central' and p.activo and coalesce(p.es_prueba, false) = v_prueba;
  return v_id;
end $$;
revoke all on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid, boolean, text, boolean, boolean, jsonb, text, boolean) from public;
grant execute on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid, boolean, text, boolean, boolean, jsonb, text, boolean) to authenticated;
