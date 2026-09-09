-- Saltear una etapa del circuito que en ESE caso no aplica.
--
-- Reunión del 09-09. Carlos, siguiendo el caso de PERUBAR —una lavadora que
-- sonaba, resuelta por videollamada—: «ya no iría en planificación, porque ya
-- no hay planificación… le tienes que dar check, check, check para poder
-- saltear». Hoy `avanzar_atencion` responde «hay que avanzar de a un paso: no
-- se saltea ninguna etapa», así que un caso resuelto por teléfono se quedaba
-- atorado en Diagnóstico para siempre.
--
-- LO QUE **NO** SE HACE, A PROPÓSITO: sellar la etapa como si se hubiera
-- cumplido. Poner `programada_at` a una visita que nunca se programó ensucia
-- el dato con el que después se mide el área. Se guarda aparte que NO APLICÓ,
-- con su motivo y su firma, y la tira la pinta distinto de una etapa hecha.

alter table atenciones
  add column if not exists etapas_omitidas jsonb not null default '{}'::jsonb;

comment on column atenciones.etapas_omitidas is
  'Etapas que en este caso NO aplicaron: {"planificacion": {"motivo": "…", '
  '"at": "…", "por": uuid}}. No son etapas cumplidas — la tira las pinta como '
  '«no aplicó» (0198).';

create or replace function omitir_etapa_atencion(
  p_atencion uuid,
  p_etapa    text,
  p_motivo   text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_a         record;
  v_motivo    text := trim(coalesce(p_motivo, ''));
  v_orden     text[] := enum_range(null::etapa_atencion)::text[];
  v_siguiente text;
begin
  select id, etapa, cerrado_at, etapas_omitidas into v_a
    from atenciones where id = p_atencion;

  if v_a.id is null then
    raise exception 'Esa atención no existe';
  end if;
  if v_a.cerrado_at is not null then
    raise exception 'La atención ya está cerrada';
  end if;

  -- QUÉ SE PUEDE SALTEAR. El diagnóstico no: decir qué le pasa al equipo y
  -- quién paga es el corazón del caso, y sin eso lo demás no significa nada.
  -- Solicitud y registro tampoco: son de Central, ya ocurrieron. Y el cierre
  -- se hace, no se saltea —para eso está «Cerrar antes de tiempo» (0181).
  if p_etapa not in ('planificacion', 'atencion', 'pruebas', 'conformidad') then
    raise exception 'Esa etapa no se puede saltear: solo planificación, atención, pruebas y conformidad';
  end if;

  -- SE SALTEA LA QUE TOCA, NO CUALQUIERA. Si no, se podría marcar «no aplica»
  -- sobre algo ya cumplido, o sobre una etapa lejana, y la tira contaría una
  -- historia que no pasó. Para saltear dos seguidas se hace dos veces, que es
  -- literalmente el «check, check, check» que pidió Carlos.
  v_siguiente := v_orden[array_position(v_orden, v_a.etapa::text) + 1];
  if p_etapa is distinct from v_siguiente then
    raise exception 'Solo se puede saltear la etapa que toca ahora (%), no «%»',
      coalesce(v_siguiente, 'ninguna'), p_etapa;
  end if;

  if length(v_motivo) < 5 then
    raise exception 'Escriba por qué no aplica: es lo que va a leer quien revise el caso después';
  end if;

  update atenciones
     set etapa = p_etapa::etapa_atencion,
         etapas_omitidas = coalesce(etapas_omitidas, '{}'::jsonb) || jsonb_build_object(
           p_etapa,
           jsonb_build_object('motivo', v_motivo, 'at', now(), 'por', auth.uid())
         ),
         updated_at = now()
   where id = p_atencion;
end $$;

comment on function omitir_etapa_atencion(uuid, text, text) is
  'Marca que una etapa NO APLICA en este caso y deja seguir el circuito, sin '
  'sellarla como cumplida. Solo la etapa que toca, y con motivo escrito (0198).';

revoke all on function omitir_etapa_atencion(uuid, text, text) from public;
grant execute on function omitir_etapa_atencion(uuid, text, text) to authenticated;
