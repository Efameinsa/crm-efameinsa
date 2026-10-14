-- QUITAR UN ARCHIVO ACOPLADO POR ERROR A LA SOLICITUD (Central, 14-10).
--
-- Central derivó a PV1 a CORPORACION HOTELERA AMAZONAS (PRO-11004) y, al
-- acoplarle lo que el cliente mandó por WhatsApp, se le fue también un video
-- de otro chat («WhatsApp Video 2026-09-29…»). «Editar lo que pide» (0227)
-- solo SUMABA archivos: no había cómo sacarlo, y postventa iba a ver el video
-- de otra máquina como si fuera la de este cliente.
--
-- Mismas reglas que corregir el texto (0354): lo hace quien lo registró,
-- Central o backoffice, mientras el contacto siga en circulación; en la
-- bandeja o en los primeros 15 min, libre; después, un motivo; con cotización
-- o venta, además el código. Queda en el historial de la solicitud (tipo
-- 'adjunto': antes = el nombre del archivo) y se le avisa a quien lo atiende.
-- El archivo NO se borra del almacenamiento: deja de estar en el contacto.

alter table lead_solicitud_cambios drop constraint if exists lead_solicitud_cambios_tipo_check;
alter table lead_solicitud_cambios
  add constraint lead_solicitud_cambios_tipo_check check (tipo in ('texto', 'ficha', 'adjunto'));

create or replace function public.quitar_adjunto_lead(
  p_lead_id uuid,
  p_path    text,
  p_motivo  text default null,
  p_pin     text default null
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quien    uuid := auth.uid();
  v_lead     leads%rowtype;
  v_motivo   text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_archivo  jsonb;
  v_firma    text;
  v_autorizo uuid;
  v_quien_nombre text;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'Ese contacto no existe'; end if;

  if v_lead.estado not in ('pendiente_triaje', 'asignado') then
    raise exception 'Ese contacto ya no está en circulación (%). No se le quitan archivos.', v_lead.estado;
  end if;

  if not puede_corregir_solicitud(p_lead_id) then
    raise exception 'Los archivos del contacto los corrige quien lo registró, Central o gerencia.';
  end if;

  select value into v_archivo
    from jsonb_array_elements(coalesce(v_lead.adjuntos, '[]'::jsonb))
   where value->>'path' = p_path
   limit 1;
  if v_archivo is null then
    raise exception 'Ese archivo ya no está en el contacto.';
  end if;

  v_firma := firma_para_corregir_solicitud(p_lead_id);
  if v_firma in ('motivo', 'codigo') and coalesce(length(v_motivo), 0) < 5 then
    raise exception 'Diga en una frase por qué quita el archivo. Queda en el historial y lo lee quien lo atiende.';
  end if;
  if v_firma = 'codigo' then
    v_autorizo := validar_codigo_autorizacion(p_pin, 'derivacion');
  end if;

  update leads
     set adjuntos   = coalesce((
           select jsonb_agg(value order by ord)
             from jsonb_array_elements(coalesce(adjuntos, '[]'::jsonb)) with ordinality as a(value, ord)
            where value->>'path' <> p_path
         ), '[]'::jsonb),
         updated_at = now()
   where id = p_lead_id;

  insert into lead_solicitud_cambios (lead_id, tipo, antes, despues, motivo, hecho_por, autorizo)
  values (p_lead_id, 'adjunto', v_archivo->>'nombre', null, v_motivo, v_quien, v_autorizo);

  if v_lead.estado = 'asignado' and v_lead.asignado_a is not null and v_lead.asignado_a <> v_quien then
    select coalesce(codigo_comercial || ' · ', '') || nombre into v_quien_nombre from perfiles where id = v_quien;
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (
      v_lead.asignado_a, 'solicitud_corregida',
      format('Quitaron un archivo de %s', coalesce(v_lead.codigo, 'un contacto suyo')),
      format('%s quitó «%s»%s: se había acoplado por error.',
             coalesce(v_quien_nombre, 'Alguien'), v_archivo->>'nombre',
             case when v_motivo is not null then ' (' || v_motivo || ')' else '' end),
      case when v_lead.oportunidad_id is not null then '/comercial/oportunidades/' || v_lead.oportunidad_id else null end
    );
  end if;

  return jsonb_array_length(coalesce((select adjuntos from leads where id = p_lead_id), '[]'::jsonb));
end $$;

revoke all on function public.quitar_adjunto_lead(uuid, text, text, text) from public, anon;
grant execute on function public.quitar_adjunto_lead(uuid, text, text, text) to authenticated;
