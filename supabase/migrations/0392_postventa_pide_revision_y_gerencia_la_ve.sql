-- ============================================================
-- CRM EFAMEINSA · Migración 0392 · Postventa le pide al ingeniero que
-- revise un borrador, y sabe cuándo lo vio
-- ============================================================
-- Gabriela (PV2), 05-10-2026, vía Santos: «no hay aún el ítem de enviar el
-- borrador a gerencia… lo que quiero es saber cómo sé que el ingeniero lo
-- vio… así como sale para derivar llamada a almacén».
--
-- Los borradores de postventa van a precio de catálogo y no piden
-- aprobación (salen `auto_aprobada`). Esto no cambia eso: es un pedido de
-- REVISIÓN, con su acuse.
--   · revision_pedida_at/por — quién de postventa la mandó a revisar y cuándo.
--   · vista_gerencia_at/por — la primera vez que gerencia abrió el borrador
--     (con o sin pedido). Volver a pedir la revisión limpia el «visto».
-- ============================================================

alter table cotizaciones
  add column if not exists revision_pedida_at   timestamptz,
  add column if not exists revision_pedida_por  uuid references perfiles (id),
  add column if not exists vista_gerencia_at    timestamptz,
  add column if not exists vista_gerencia_por   uuid references perfiles (id);

comment on column cotizaciones.revision_pedida_at is 'Postventa pidió a gerencia revisar este borrador (0392).';
comment on column cotizaciones.vista_gerencia_at is 'Primera vez que gerencia abrió el borrador después del último pedido de revisión (0392).';

create or replace function public.pedir_revision_cotizacion(p_cotizacion uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_c cotizaciones%rowtype;
begin
  if not coalesce(puede_postventa(), false) then
    raise exception 'Solo postventa pide la revisión de una cotización.';
  end if;
  select * into v_c from cotizaciones where id = p_cotizacion;
  if not found then
    raise exception 'La cotización no existe.';
  end if;
  if v_c.estado <> 'borrador' or v_c.enviada_at is not null then
    raise exception 'Esta cotización ya tiene número: la revisión se pide sobre el borrador.';
  end if;
  update cotizaciones
     set revision_pedida_at = now(),
         revision_pedida_por = auth.uid(),
         vista_gerencia_at = null,
         vista_gerencia_por = null
   where id = p_cotizacion;
end;
$$;

-- Devuelve true solo la PRIMERA vez (o la primera después de un nuevo pedido): con eso se avisa a
-- quien la pidió una sola vez, no cada vez que el ingeniero la vuelve a abrir.
create or replace function public.marcar_cotizacion_vista_gerencia(p_cotizacion uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_filas int;
begin
  -- Solo gerencia: una revisión técnica desde admin no le da a postventa un «visto» falso.
  if coalesce(rol_actual()::text, '') <> 'gerencia' then
    return false;
  end if;
  update cotizaciones
     set vista_gerencia_at = now(),
         vista_gerencia_por = auth.uid()
   where id = p_cotizacion
     and estado = 'borrador'
     and vista_gerencia_at is null;
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

grant execute on function public.pedir_revision_cotizacion(uuid) to authenticated;
grant execute on function public.marcar_cotizacion_vista_gerencia(uuid) to authenticated;
