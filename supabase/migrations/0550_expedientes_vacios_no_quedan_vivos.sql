-- ============================================================
-- CRM EFAMEINSA · Migración 0550 · Un expediente sin gestión no queda vivo
-- ============================================================
-- Reunión de gerencia 20-10-2026 (Beneficencia de Huancayo, con Brenda PV2):
-- en la ficha seguía un «expediente vivo» con «primer contacto todavía sin
-- gestión asignada». Era un seguimiento que Ariana (PV3) abrió el 14-10 a las
-- 18:30 al apretar «Registrar seguimiento» y no guardó nada: la función
-- expediente_para_seguimiento lo crea ANTES de que se escriba la gestión, y
-- si se cancela queda vivo y vacío. Al 20-10 había 22 así. Gerencia: «que sea
-- mandatorio… si no, no hay que registrar».
--
--   1. expediente_esta_vacio(op): nada cuelga de él (gestiones, cotizaciones,
--      leads, casos, pedidos, cierres, ventas, visitas, llamadas, decisiones,
--      expedientes unidos) y su próxima acción está vacía o es la automática
--      «Seguimiento de cartera». Un «Ofrecer mantenimiento preventivo»
--      agendado NO es vacío: es una tarea que alguien puso.
--   2. descartar_expediente_vacio(op): la pantalla lo llama al cerrar «Anotar
--      gestión» sin guardar. Solo borra si es de quien lo pide (o de su área de
--      postventa), es de las últimas 24 h y sigue vacío. Si no, no hace nada.
--   3. limpiar_expedientes_vacios(horas, motivo): lo llama el temporizador
--      nocturno de la máquina virtual (con la llave de servicio) para los que
--      se escaparan por otra puerta (cerrar la pestaña, el botón viejo que
--      navega al expediente). Devuelve lo que borró, para el aviso.
-- No hay nada que archivar: un expediente vacío no tiene historia. Se borra.
-- ============================================================

create or replace function public.expediente_esta_vacio(p_op uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from oportunidades o where o.id = p_op
                   and coalesce(btrim(o.proxima_accion), '') in ('', 'Seguimiento de cartera'))
     and not exists (select 1 from actividades where oportunidad_id = p_op)
     and not exists (select 1 from cotizaciones where oportunidad_id = p_op)
     and not exists (select 1 from leads where oportunidad_id = p_op)
     and not exists (select 1 from oportunidades l where l.id = p_op and l.lead_id is not null)
     and not exists (select 1 from atenciones where oportunidad_id = p_op or oportunidad_origen = p_op)
     and not exists (select 1 from servicios_postventa where oportunidad_id = p_op)
     and not exists (select 1 from informes_cierre where oportunidad_id = p_op)
     and not exists (select 1 from ventas where oportunidad_id = p_op)
     and not exists (select 1 from visitas_planta where oportunidad_id = p_op)
     and not exists (select 1 from llamadas where oportunidad_id = p_op)
     and not exists (select 1 from cotizacion_decisiones where oportunidad_id = p_op)
     and not exists (select 1 from solicitudes_infocorp where oportunidad_id = p_op)
     and not exists (select 1 from oportunidades u where u.unida_a = p_op)
$$;
revoke all on function public.expediente_esta_vacio(uuid) from public;
grant execute on function public.expediente_esta_vacio(uuid) to authenticated, service_role;

create or replace function public.descartar_expediente_vacio(p_op uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_quien uuid := auth.uid();
  v_op oportunidades%rowtype;
begin
  if v_quien is null then return false; end if;
  select * into v_op from oportunidades where id = p_op;
  if not found then return false; end if;
  if v_op.created_at < now() - interval '24 hours' then return false; end if;
  if v_op.etapa in ('venta', 'rechazada', 'historico') or v_op.cerrada_at is not null then return false; end if;
  if v_op.comercial_id is distinct from v_quien
     and not (v_op.tipo_postventa is not null and coalesce(puede_postventa(), false)) then
    return false;
  end if;
  if not expediente_esta_vacio(p_op) then return false; end if;
  delete from oportunidades where id = p_op;
  return true;
end $$;
revoke all on function public.descartar_expediente_vacio(uuid) from public;
grant execute on function public.descartar_expediente_vacio(uuid) to authenticated;

create or replace function public.limpiar_expedientes_vacios(p_horas integer default 24)
returns table (id uuid, cuenta text, dueno uuid, creado timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with borrar as (
    select o.id, c.razon_social::text as cuenta, o.comercial_id as dueno, o.created_at as creado
      from oportunidades o
      join cuentas c on c.id = o.cuenta_id
     where o.created_at < now() - make_interval(hours => p_horas)
       and o.etapa not in ('venta', 'rechazada', 'historico')
       and o.cerrada_at is null
       and o.unida_a is null
       and o.origen = 'crm'
       and expediente_esta_vacio(o.id)
  ), hecho as (
    delete from oportunidades o using borrar b where o.id = b.id returning o.id
  )
  select b.id, b.cuenta, b.dueno, b.creado from borrar b join hecho h on h.id = b.id;
end $$;
revoke all on function public.limpiar_expedientes_vacios(integer) from public, authenticated;
grant execute on function public.limpiar_expedientes_vacios(integer) to service_role;
