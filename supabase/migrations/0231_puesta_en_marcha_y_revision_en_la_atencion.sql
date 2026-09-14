-- ============================================================
-- CRM EFAMEINSA · Migración 0231 · Puesta en marcha y «Revisión» en la atención técnica
-- ============================================================
-- Ariana con Santos, 14-09 18:03 (audio de postventa). Dos huecos del circuito:
--
-- 1) «BUNGARENA y SIERRA TRAVEL son clientes que han llamado solicitando ya su
--    puesta en marcha, pero la central lo clasifica como problema técnico. Al
--    poner problema técnico se va todo el circuito y no me deja programar la
--    puesta en marcha (…) te pide el diagnóstico, te pide más cosas».
--    El diálogo de Central solo ofrecía tres clases (soporte técnico, repuesto,
--    mantenimiento) y «soporte técnico» nace como `problema_tecnico`; el tipo
--    `puesta_en_marcha` existía (0131) pero no había cómo elegirlo desde
--    Central ni cómo corregirlo después. Desde hoy Central lo elige, y
--    postventa puede cambiar el tipo entre problema técnico y puesta en marcha
--    mientras el caso no haya pasado del diagnóstico. La puesta en marcha no
--    lleva diagnóstico: se programa directo.
--
-- 2) «Si la máquina no presentaba nada, no va a haber nada de garantía, no lo
--    voy a facturar, no lo voy a cotizar: te da una revisión, porque el cliente
--    me informó que está trabajando bien. Le pongo un chip más que diga
--    Revisión». Clasificación nueva, no se cobra, y el caso sigue las etapas
--    normales hasta cerrarse con «quedó todo ok».
-- ============================================================

alter type clasificacion_atencion add value if not exists 'revision';

create or replace function public.cambiar_tipo_atencion(p_atencion uuid, p_tipo tipo_atencion)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a record;
begin
  if not (coalesce(es_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Solo postventa, operaciones o gerencia cambian el tipo de una atención';
  end if;
  select id, tipo, etapa, cerrado_at into v_a from atenciones where id = p_atencion;
  if v_a.id is null then raise exception 'Esa atención no existe'; end if;
  if v_a.cerrado_at is not null then raise exception 'La atención ya está cerrada'; end if;
  -- Solo entre las dos de la pista técnica: repuesto y mantenimiento son otra
  -- pista (comercial) y otro expediente.
  if v_a.tipo not in ('problema_tecnico', 'puesta_en_marcha') or p_tipo not in ('problema_tecnico', 'puesta_en_marcha') then
    raise exception 'Solo se cambia entre problema técnico y puesta en marcha';
  end if;
  -- Mientras no se haya avanzado más allá del diagnóstico: después ya hay
  -- técnico programado y trabajo hecho sobre ese tipo.
  if v_a.etapa not in ('solicitud', 'registro', 'diagnostico') then
    raise exception 'El caso ya está en %; el tipo se cambia antes de planificarlo', v_a.etapa;
  end if;
  if v_a.tipo = p_tipo then return; end if;
  update atenciones set tipo = p_tipo, updated_at = now() where id = p_atencion;
end $$;

revoke all on function public.cambiar_tipo_atencion(uuid, tipo_atencion) from public;
grant execute on function public.cambiar_tipo_atencion(uuid, tipo_atencion) to authenticated;
comment on function public.cambiar_tipo_atencion(uuid, tipo_atencion) is
  'Postventa corrige el tipo de una atención técnica (problema técnico ↔ puesta en marcha) mientras no esté planificada (0231, Ariana 14-09).';
