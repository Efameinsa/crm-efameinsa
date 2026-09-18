-- 18-09-2026: el circuito de la visita se cierra (Carlos, reunión 09:55:
-- «tiene visitas nuestro amigo Moisés, pero no veo que haya planificado… hay
-- que mapearlo, va a aliviar muchas cosas»). Hasta hoy la visita tenía los
-- checks de Central y del almacén (0247) pero NO tenía final: el comercial que
-- la atendía no podía decir cómo terminó, y la clase 2 de la inducción dice
-- «la visita se registra en el CRM como una gestión; una visita que no se
-- registra, para la empresa no ocurrió». Cero visitas reales registradas al
-- 18-09.
--
-- Ahora: quien la atendió la cierra con un RESULTADO, y eso escribe la
-- gestión (tipo `showroom`) en la oportunidad viva del cliente, que es lo que
-- cuenta en la medición.

alter table visitas_planta
  add column if not exists atendida_por uuid references perfiles(id),
  add column if not exists atendida_at timestamptz,
  add column if not exists resultado text check (resultado in (
    'compro', 'pide_cotizacion', 'evaluando', 'recogio', 'pago', 'solo_miro', 'no_vino')),
  add column if not exists resultado_nota text,
  add column if not exists cerrada_at timestamptz,
  add column if not exists actividad_id uuid references actividades(id) on delete set null;

comment on column visitas_planta.resultado is 'Cómo terminó la visita (0256): compro, pide_cotizacion, evaluando, recogio, pago, solo_miro, no_vino.';
comment on column visitas_planta.actividad_id is 'La gestión que dejó en la oportunidad al cerrarse (0256).';

create or replace function public.cerrar_visita_planta(p_visita uuid, p_resultado text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quien uuid := auth.uid();
  v_v record;
  v_op uuid;
  v_act uuid;
  v_etiqueta text;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  select * into v_v from visitas_planta where id = p_visita;
  if v_v.id is null then raise exception 'Esa visita no existe'; end if;
  if v_v.cancelada_at is not null then raise exception 'Esa visita está cancelada'; end if;
  if v_v.cerrada_at is not null then raise exception 'Esa visita ya se cerró'; end if;
  -- Quién cierra: quien la registró (el que la atiende), Central, postventa o gerencia.
  if not (v_v.registrado_por = v_quien or coalesce(rol_actual() = 'central', false)
          or coalesce(es_backoffice(), false) or coalesce(puede_postventa(), false)) then
    raise exception 'La visita la cierra quien la atendió o Central';
  end if;
  if p_resultado not in ('compro', 'pide_cotizacion', 'evaluando', 'recogio', 'pago', 'solo_miro', 'no_vino') then
    raise exception 'Resultado no válido';
  end if;

  v_etiqueta := case p_resultado
    when 'compro' then 'compró / cerró'
    when 'pide_cotizacion' then 'pide cotización'
    when 'evaluando' then 'queda evaluando'
    when 'recogio' then 'recogió repuesto o documento'
    when 'pago' then 'vino a pagar'
    when 'solo_miro' then 'solo miró'
    else 'no vino' end;

  -- La oportunidad: la que trajo la visita o la viva del cliente.
  v_op := v_v.oportunidad_id;
  if v_op is null and v_v.cuenta_id is not null then
    select o.id into v_op from oportunidades o
     where o.cuenta_id = v_v.cuenta_id and o.cerrada_at is null
     order by o.created_at desc limit 1;
  end if;
  if v_op is not null and p_resultado <> 'no_vino' then
    insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
    values (v_op, 'showroom',
      'Visita a planta: ' || v_v.persona || ' (' || v_v.empresa || ') vino a ' || v_v.motivo
      || case when v_v.equipo_a_ver is not null then ' · vio ' || v_v.equipo_a_ver else '' end
      || '. Resultado: ' || v_etiqueta
      || case when nullif(btrim(coalesce(p_nota, '')), '') is not null then '. ' || btrim(p_nota) else '' end,
      v_quien, coalesce(v_v.llego_at, now()))
    returning id into v_act;
  end if;

  update visitas_planta
     set atendida_por = case when p_resultado = 'no_vino' then null else v_quien end,
         atendida_at = case when p_resultado = 'no_vino' then null else coalesce(llego_at, now()) end,
         no_vino_at = case when p_resultado = 'no_vino' then coalesce(no_vino_at, now()) else no_vino_at end,
         resultado = p_resultado,
         resultado_nota = nullif(btrim(coalesce(p_nota, '')), ''),
         cerrada_at = now(),
         actividad_id = v_act
   where id = p_visita;

  return jsonb_build_object('oportunidad_id', v_op, 'actividad_id', v_act);
end;
$$;
