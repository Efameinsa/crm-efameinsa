-- ============================================================
-- CRM EFAMEINSA · Migración 0261 · «Registrar seguimiento» va al expediente
-- abierto del propio comercial, antes de abrir otro
-- ============================================================
-- 21-09-2026, caso Las Poncianas (Ariana, C4): reactivó del histórico el
-- expediente comercial del cliente (12:24:46) y cuatro segundos después tocó
-- «Registrar seguimiento» en la misma ficha. La función solo buscaba
-- expedientes de POSTVENTA (tipo_postventa not null); el reactivado es
-- comercial, así que abrió uno nuevo de seguimiento y la llamada quedó ahí.
-- El reactivado siguió pidiendo «Retomar contacto» hoy y salió en la agenda
-- como si no se hubiera gestionado. Mismo patrón que Asmat Vera (19-09), con
-- otra puerta.
--
-- Regla (la de Carlos del 01-09, un expediente por cliente y comercial):
--   1. el expediente ABIERTO de quien registra con ese cliente, sea comercial
--      o de postventa, el de movimiento más reciente;
--   2. si no tiene, el de postventa abierto de cualquiera del área;
--   3. si no hay ninguno, recién se abre uno de seguimiento.
-- ============================================================

create or replace function public.expediente_para_seguimiento(p_cuenta uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid := auth.uid();
  v_id uuid;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if not coalesce(puede_postventa(), false) and not coalesce(es_backoffice(), false) then
    raise exception 'El seguimiento de postventa lo registra el área';
  end if;
  if not exists (select 1 from cuentas where id = p_cuenta) then
    raise exception 'Ese cliente no existe';
  end if;

  -- 1. El mío abierto con este cliente, del tipo que sea.
  select o.id into v_id
    from oportunidades o
   where o.cuenta_id = p_cuenta
     and o.comercial_id = v_quien
     and o.cerrada_at is null
     and o.etapa not in ('venta', 'rechazada', 'derivada', 'historico')
   order by o.updated_at desc
   limit 1;
  if v_id is not null then return v_id; end if;

  -- 2. El de postventa abierto de cualquiera del área.
  select o.id into v_id
    from oportunidades o
   where o.cuenta_id = p_cuenta
     and o.tipo_postventa is not null
     and o.cerrada_at is null
     and o.etapa not in ('venta', 'rechazada', 'derivada', 'historico')
   order by o.updated_at desc
   limit 1;
  if v_id is not null then return v_id; end if;

  -- 3. Recién ahora, uno nuevo de seguimiento.
  insert into oportunidades (cuenta_id, comercial_id, tipo_postventa, etapa, origen, intencion)
  values (p_cuenta, v_quien, 'seguimiento', 'seguimiento', 'crm', 'sin_definir')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.expediente_para_seguimiento(uuid) from public;
grant execute on function public.expediente_para_seguimiento(uuid) to authenticated;
