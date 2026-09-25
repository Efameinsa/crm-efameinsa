-- ============================================================
-- CRM EFAMEINSA · Migración 0311 · La apertura se reprograma y se corrige
-- ============================================================
-- 25-09-2026, dos pedidos de Rubí (postventa) en la misma tarde que
-- terminaron en «Santos, ¿lo puedes cambiar internamente?»:
--
--  1. KARINA SAAVEDRA HOSPEDAJE: eligió «videollamada de puesta en marcha»
--     y era de PREINSTALACIÓN. La orden, el informe N.º 4-2026 y el paso del
--     pedido salieron con el tipo equivocado y no había cómo corregirlo.
--  2. ELVIS CHOQUEHUANCA: «la llamada no se realizará porque mañana habrá
--     despacho, quiero reprogramarla para el lunes». La fecha se fijaba al
--     enviar y solo quedaba anular y volver a llenar todo.
--
-- QUÉ HACE.
--  · `cambios` (jsonb): el historial de lo que se movió —reprogramada, tipo
--    corregido—, con quién, cuándo, de qué a qué y por qué.
--  · reprogramar_apertura_llamada(): nueva fecha y hora mientras el almacén
--    no haya subido su informe (después, la llamada ya se hizo).
--  · corregir_tipo_apertura(): cambia el tipo y arrastra lo que depende de
--    él: el informe de servicio que salió de la apertura (tipo y asunto, con
--    el mismo número) y el paso de preinstalación del pedido, igual que lo
--    habría dejado revisar_apertura_llamada() con el tipo correcto.
-- Quién puede: los mismos que anulan (postventa, backoffice, operaciones).
-- ============================================================

alter table public.aperturas_llamada
  add column if not exists cambios jsonb not null default '[]'::jsonb;

comment on column public.aperturas_llamada.cambios is
  'Historial de reprogramaciones y correcciones de tipo (0311): [{que, de, a, motivo, por, at}].';

create or replace function public.reprogramar_apertura_llamada(p_id uuid, p_programada timestamptz, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a aperturas_llamada%rowtype;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La reprograma postventa';
  end if;
  select * into a from aperturas_llamada
   where id = p_id and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if not found or a.anulada_at is not null then raise exception 'Esa apertura no existe o está anulada'; end if;
  if a.informe_at is not null then
    raise exception 'El almacén ya subió su informe: esa llamada ya se hizo. Para otra fecha, envíe una apertura nueva';
  end if;
  if p_programada is null then raise exception 'Falta el día y la hora'; end if;
  if p_programada < now() - interval '1 hour' then raise exception 'La nueva fecha ya pasó'; end if;
  if p_programada = a.programada_para then raise exception 'Es la misma fecha y hora que ya tenía'; end if;

  update aperturas_llamada
     set programada_para = p_programada,
         cambios = cambios || jsonb_build_array(jsonb_build_object(
           'que', 'reprogramada',
           'de', a.programada_para,
           'a', p_programada,
           'motivo', nullif(btrim(coalesce(p_motivo, '')), ''),
           'por', auth.uid(),
           'at', now()))
   where id = p_id;
end $$;

create or replace function public.corregir_tipo_apertura(p_id uuid, p_tipo text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a aperturas_llamada%rowtype;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'El tipo lo corrige postventa';
  end if;
  if p_tipo not in ('videollamada_preinstalacion', 'videollamada_puesta_marcha', 'soporte_videollamada', 'atencion_in_situ', 'revision') then
    raise exception 'Tipo de apertura desconocido';
  end if;
  select * into a from aperturas_llamada
   where id = p_id and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if not found or a.anulada_at is not null then raise exception 'Esa apertura no existe o está anulada'; end if;
  if a.tipo = p_tipo then raise exception 'La apertura ya es de ese tipo'; end if;

  update aperturas_llamada
     set tipo = p_tipo,
         cambios = cambios || jsonb_build_array(jsonb_build_object(
           'que', 'tipo',
           'de', a.tipo,
           'a', p_tipo,
           'motivo', nullif(btrim(coalesce(p_motivo, '')), ''),
           'por', auth.uid(),
           'at', now()))
   where id = p_id;

  -- El informe de servicio que salió de esta apertura lleva el tipo y el
  -- asunto del tipo (los mismos que InformeSoporteApertura). Conserva su número.
  if a.informe_servicio_id is not null then
    update informes_servicio
       set tipo = (case p_tipo
                    when 'videollamada_puesta_marcha' then 'puesta_en_marcha'
                    when 'atencion_in_situ' then 'tecnico'
                    when 'revision' then 'revision'
                    else 'llamada' end)::tipo_servicio_pv,
           asunto = case p_tipo
                    when 'videollamada_preinstalacion' then 'Video llamada'
                    when 'videollamada_puesta_marcha' then 'Video llamada · puesta en marcha'
                    when 'soporte_videollamada' then 'Video llamada · soporte técnico'
                    when 'atencion_in_situ' then 'Atención técnica en el local del cliente'
                    else 'Revisión del equipo' end,
           updated_at = now()
     where id = a.informe_servicio_id;
  end if;

  -- El paso de preinstalación del pedido: si ya se revisó, queda como lo
  -- habría dejado la revisión con el tipo correcto.
  if a.servicio_id is not null and a.revisada_at is not null then
    if p_tipo = 'videollamada_preinstalacion' then
      update servicios_postventa
         set preinstalacion_ok_at = coalesce(preinstalacion_ok_at, a.revisada_at),
             preinstalacion_nota = coalesce(preinstalacion_nota, left(btrim(coalesce(a.informe_cliente, '')), 500)),
             updated_at = now()
       where id = a.servicio_id;
    elsif a.tipo = 'videollamada_preinstalacion' then
      -- Solo se deshace lo que marcó esta misma apertura, no una preinstalación
      -- que se registró por otro lado.
      update servicios_postventa
         set preinstalacion_ok_at = null, preinstalacion_nota = null, updated_at = now()
       where id = a.servicio_id
         and abs(extract(epoch from preinstalacion_ok_at - a.revisada_at)) < 1;
    end if;
  end if;
end $$;

revoke all on function public.reprogramar_apertura_llamada(uuid, timestamptz, text) from public, anon;
revoke all on function public.corregir_tipo_apertura(uuid, text, text) from public, anon;
grant execute on function public.reprogramar_apertura_llamada(uuid, timestamptz, text) to authenticated;
grant execute on function public.corregir_tipo_apertura(uuid, text, text) to authenticated;
