-- ============================================================
-- CRM EFAMEINSA · Migración 0080 · Reasignar una cartera desde la pantalla
-- ============================================================
-- Hasta hoy pasar un cliente de un comercial a otro se hacía por script, con
-- Darwin en el teclado (SAYWA→Brenda, ANDES PRIME→Katerine, ambos el 25-08 y
-- ambos por orden del ingeniero). Dos en un día es la señal de que la
-- operación es rutinaria y necesita pantalla — pero con el MISMO candado que
-- tenía el script: la regla de gerencia del 14-08 dice que un cliente
-- pertenece a quien lo atendió y que moverlo es decisión manual de gerencia.
-- Por eso la función exige es_backoffice() (gerencia o admin), y Central no
-- puede llamarla — Central tiene redirigir_lead (0079), que corrige errores
-- de derivación y se niega en cuanto hay trabajo hecho.
--
-- QUÉ MUEVE (la semántica probada del script, calcada):
--   · la cuenta, con cartera_desde = hoy (el dato del que sale «liberable»);
--   · las oportunidades ABIERTAS (asignada, filtrada, cotizada, seguimiento,
--     potencial): son trabajo pendiente, y el trabajo pendiente sobre un
--     cliente es de quien tiene el cliente. Sin esto el cliente aparecía en
--     Mi cartera del nuevo dueño y en ningún otro lado — no lo podía
--     gestionar (caso ANDES PRIME);
--   · el contacto derivado que originó cada oportunidad movida, si sigue en
--     estado 'asignado': si no, la bandeja de derivados de Central seguiría
--     diciendo que está con el comercial anterior.
--
-- QUÉ NO MUEVE: las oportunidades CERRADAS (venta, rechazada, derivada).
-- Registran quién hizo ese trabajo; moverlas llevaría ventas y rechazos de un
-- año a los números de otra persona. El nuevo dueño las ve igual por la RLS
-- de la 0013.

create or replace function reasignar_cartera(p_cuenta_id uuid, p_comercial_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta     cuentas%rowtype;
  v_anterior   uuid;
  v_ops        integer;
  v_leads      integer;
begin
  if not es_backoffice() then
    raise exception 'Reasignar una cartera es decisión de gerencia';
  end if;

  select * into v_cuenta from cuentas where id = p_cuenta_id;
  if v_cuenta is null then
    raise exception 'No existe ese cliente';
  end if;
  if v_cuenta.comercial_id = p_comercial_id then
    raise exception 'Ese cliente ya está en la cartera de ese comercial';
  end if;

  if not exists (
    select 1 from perfiles
     where id = p_comercial_id and rol = 'comercial' and activo and not es_prueba
  ) then
    raise exception 'El destino no es un comercial activo';
  end if;

  v_anterior := v_cuenta.comercial_id;

  update cuentas set comercial_id = p_comercial_id, cartera_desde = current_date
   where id = p_cuenta_id;

  with movidas as (
    update oportunidades
       set comercial_id = p_comercial_id, updated_at = now()
     where cuenta_id = p_cuenta_id
       and etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')
       and comercial_id is distinct from p_comercial_id
    returning id, lead_id
  ), leads_movidos as (
    update leads l
       set asignado_a = p_comercial_id, updated_at = now()
      from movidas m
     where l.id = m.lead_id and l.estado = 'asignado'
    returning l.id
  )
  select (select count(*) from movidas), (select count(*) from leads_movidos)
    into v_ops, v_leads;

  return jsonb_build_object(
    'anterior', v_anterior,
    'oportunidades_movidas', v_ops,
    'leads_movidos', v_leads
  );
end $$;

comment on function reasignar_cartera(uuid, uuid) is
  'Pasa un cliente (y sus oportunidades abiertas) a otra cartera. Solo gerencia/admin: la regla del 14-08 dice que reasignar es decisión manual de gerencia (migración 0080).';

revoke all on function reasignar_cartera(uuid, uuid) from public;
grant execute on function reasignar_cartera(uuid, uuid) to authenticated;
