-- ════════════════════════════════════════════════════════════════════════
-- 0511 · Los acompañantes de la visita se editan
--
-- Katerine, 16-10, con la visita de ABACHI E.I.R.L. a las 12:00: «me acaba de
-- avisar que al final viene con dos personas, ¿cómo edito?». Al anunciar la
-- visita se ponen nombre y DNI de los acompañantes, pero después solo se podía
-- cambiar la fecha o la hora: para sumar a alguien había que cancelar y volver
-- a anunciar.
--
-- Mismo candado que cambiar la hora (0303): quien registró la visita, o
-- Central. No en una visita cerrada, cancelada o que ya llegó. Si vigilancia
-- ya tenía la hoja, el check se apaga para que Central vuelva a imprimir, y el
-- cambio queda anotado en las notas de la visita.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.cambiar_acompanantes_visita(p_visita uuid, p_acompanantes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_v visitas_planta%rowtype;
  v_nombre text;
  v_nuevos jsonb;
  v_texto text;
begin
  select * into v_v from visitas_planta where id = p_visita;
  if v_v.id is null then raise exception 'Esa visita no existe'; end if;
  if v_v.registrado_por is distinct from auth.uid() and not coalesce(rol_actual() in ('central', 'gerencia', 'admin', 'operaciones'), false) then
    raise exception 'Los acompañantes los cambia quien registró la visita, o Central';
  end if;
  if v_v.cancelada_at is not null then raise exception 'La visita está cancelada'; end if;
  if v_v.cerrada_at is not null then raise exception 'La visita ya se registró con su resultado'; end if;
  if v_v.llego_at is not null then raise exception 'El cliente ya llegó: avise a Central para que hable con vigilancia'; end if;

  -- Solo los que tienen nombre; el documento es opcional, como al anunciar.
  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre', left(btrim(a->>'nombre'), 120),
           'dni', nullif(left(btrim(coalesce(a->>'dni', '')), 20), ''))), '[]'::jsonb)
    into v_nuevos
    from jsonb_array_elements(coalesce(p_acompanantes, '[]'::jsonb)) a
   where btrim(coalesce(a->>'nombre', '')) <> '';

  if v_nuevos = coalesce(v_v.acompanantes, '[]'::jsonb) then
    return jsonb_build_object('cambio', false);
  end if;

  select nombre into v_nombre from perfiles where id = auth.uid();
  select coalesce(string_agg(a->>'nombre' || coalesce(' (' || (a->>'dni') || ')', ''), ', '), 'ninguno')
    into v_texto from jsonb_array_elements(v_nuevos) a;

  update visitas_planta set
    acompanantes  = v_nuevos,
    -- Vigilancia tenía la hoja con otros nombres: se vuelve a imprimir.
    impreso_at    = null,
    impreso_por   = null,
    notas_central = concat_ws(E'\n', notas_central,
      format('%s: %s cambió los acompañantes: %s%s', to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI'),
             coalesce(v_nombre, 'alguien'), v_texto,
             case when v_v.impreso_at is not null then ' (volver a avisar a vigilancia)' else '' end))
  where id = p_visita;

  return jsonb_build_object('cambio', true, 'acompanantes', v_nuevos,
                            'vigilancia_avisada', v_v.impreso_at is not null, 'es_prueba', v_v.es_prueba);
end $$;
revoke all on function public.cambiar_acompanantes_visita(uuid, jsonb) from public;
grant execute on function public.cambiar_acompanantes_visita(uuid, jsonb) to authenticated;
