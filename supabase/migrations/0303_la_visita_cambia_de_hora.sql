-- ════════════════════════════════════════════════════════════════════════
-- 0303 · La visita cambia de hora
--
-- Katerine, 25-09, en «Mis visitas a la planta»: «en esa vista debería poder
-- editar la hora». La visita se anunciaba con fecha y hora y no había cómo
-- corregirlas: solo cancelarla y volver a anunciarla (otro correo, otra hoja
-- para vigilancia).
--
-- La cambia quien la registró, o Central (el mismo candado que cancelar).
-- No se cambia una visita cerrada, cancelada o que ya llegó. Si vigilancia ya
-- estaba avisada con la hora vieja, el check se apaga para que Central vuelva
-- a imprimir, y el cambio queda anotado en las notas de la visita.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.reprogramar_visita_planta(p_visita uuid, p_fecha date, p_hora time)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_v visitas_planta%rowtype;
  v_nombre text;
  v_antes text;
  v_despues text;
begin
  select * into v_v from visitas_planta where id = p_visita;
  if v_v.id is null then raise exception 'Esa visita no existe'; end if;
  -- coalesce: sin perfil, rol_actual() es null y el «not in» no entraba (ver 0127).
  if v_v.registrado_por is distinct from auth.uid() and not coalesce(rol_actual() in ('central', 'gerencia', 'admin', 'operaciones'), false) then
    raise exception 'La hora la cambia quien registró la visita, o Central';
  end if;
  if v_v.cancelada_at is not null then raise exception 'La visita está cancelada'; end if;
  if v_v.cerrada_at is not null then raise exception 'La visita ya se registró con su resultado'; end if;
  if v_v.llego_at is not null then raise exception 'El cliente ya llegó: la hora ya no se cambia'; end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  if p_fecha < (now() at time zone 'America/Lima')::date then raise exception 'La fecha nueva ya pasó'; end if;
  if p_fecha = v_v.fecha and p_hora is not distinct from v_v.hora then
    return jsonb_build_object('cambio', false);
  end if;

  select nombre into v_nombre from perfiles where id = auth.uid();
  v_antes   := to_char(v_v.fecha, 'DD-MM') || ' ' || coalesce(to_char(v_v.hora, 'HH24:MI'), 'sin hora');
  v_despues := to_char(p_fecha, 'DD-MM') || ' ' || coalesce(to_char(p_hora, 'HH24:MI'), 'sin hora');

  update visitas_planta set
    fecha        = p_fecha,
    hora         = p_hora,
    no_vino_at   = null,
    -- Vigilancia tenía la hoja con la hora vieja: se vuelve a imprimir.
    impreso_at   = null,
    impreso_por  = null,
    notas_central = concat_ws(E'\n', notas_central,
      format('%s: %s cambió la visita de %s a %s%s', to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI'),
             coalesce(v_nombre, 'alguien'), v_antes, v_despues,
             case when v_v.impreso_at is not null then ' (volver a avisar a vigilancia)' else '' end))
  where id = p_visita;

  return jsonb_build_object('cambio', true, 'antes', v_antes, 'despues', v_despues,
                            'vigilancia_avisada', v_v.impreso_at is not null, 'es_prueba', v_v.es_prueba);
end $$;
revoke all on function public.reprogramar_visita_planta(uuid, date, time) from public;
grant execute on function public.reprogramar_visita_planta(uuid, date, time) to authenticated;
