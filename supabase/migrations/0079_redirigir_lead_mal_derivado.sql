-- ============================================================
-- CRM EFAMEINSA · Migración 0079 · Corregir una derivación equivocada
-- ============================================================
-- Central, 25-08: «lo que quiero es verificar a quién derivé para poder
-- redireccionar a otra comercial, ya que hubo un error al asignar».
--
-- Hasta hoy una derivación era definitiva: se elegía el comercial y no había
-- vuelta atrás. Un error de un clic se quedaba en el sistema y se arreglaba por
-- WhatsApp, con el contacto en la bandeja de quien no le correspondía.
--
-- QUÉ MUEVE. Las tres cosas juntas, o ninguna: el lead, la oportunidad que
-- nació de él y la cuenta. La cuenta también, porque sin ella el nuevo
-- comercial recibiría una oportunidad de un cliente que no puede abrir — la
-- policy `cuentas_comercial` exige ser el dueño de la cuenta para verla.
--
-- ------------------------------------------------------------
-- DÓNDE ESTÁ EL LÍMITE, Y POR QUÉ
-- ------------------------------------------------------------
-- Esto corrige un ERROR DE ASIGNACIÓN, no traspasa una cartera. La regla de
-- gerencia del 14-08 dice que un cliente pertenece a quien lo atendió y que
-- moverlo es decisión de gerencia. Las dos cosas se parecen en la pantalla y
-- son muy distintas en la práctica, así que la función se niega cuando ya hay
-- trabajo hecho:
--
--   · si el comercial ya cotizó         → cotizar es haberlo atendido;
--   · si ya registró alguna gestión     → llamó, escribió, visitó;
--   · si la cuenta tiene más historia   → otras oportunidades o una venta
--                                          anterior: el cliente ya era suyo.
--
-- En esos casos el mensaje dice que lo pida a gerencia, en vez de dejar que
-- Central mueva una cartera sin querer. Un error se corrige en minutos; una
-- cartera se traspasa con una decisión.

create or replace function redirigir_lead(p_lead_id uuid, p_comercial_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead        leads%rowtype;
  v_oportunidad oportunidades%rowtype;
  v_cuenta      cuentas%rowtype;
  v_n           integer;
begin
  if not (rol_actual() = 'central'::rol_usuario or es_backoffice()) then
    raise exception 'Solo Central puede corregir una derivación';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if v_lead is null then
    raise exception 'No existe ese contacto';
  end if;
  if v_lead.estado <> 'asignado' then
    raise exception 'Ese contacto no está derivado a nadie';
  end if;
  if v_lead.asignado_a = p_comercial_id then
    raise exception 'Ese contacto ya está con ese comercial';
  end if;

  if not exists (
    select 1 from perfiles
     where id = p_comercial_id and rol = 'comercial' and activo
  ) then
    raise exception 'El destino no es un comercial activo';
  end if;

  select * into v_oportunidad from oportunidades where lead_id = p_lead_id order by created_at limit 1;

  if v_oportunidad.id is not null then
    select count(*) into v_n from cotizaciones where oportunidad_id = v_oportunidad.id;
    if v_n > 0 then
      raise exception 'No se puede: ese comercial ya hizo % cotización(es). Un cliente cotizado se traspasa con autorización de gerencia.', v_n;
    end if;

    select count(*) into v_n from actividades where oportunidad_id = v_oportunidad.id;
    if v_n > 0 then
      raise exception 'No se puede: ese comercial ya registró % gestión(es) sobre este contacto. Pídalo a gerencia.', v_n;
    end if;

    select * into v_cuenta from cuentas where id = v_oportunidad.cuenta_id;

    select count(*) into v_n from oportunidades
     where cuenta_id = v_oportunidad.cuenta_id and id <> v_oportunidad.id;
    if v_n > 0 then
      raise exception 'No se puede: este cliente ya tenía % oportunidad(es) antes de esta derivación. Pídalo a gerencia.', v_n;
    end if;

    if v_cuenta.ultima_venta_at is not null then
      raise exception 'No se puede: a este cliente ya se le vendió. Traspasarlo es decisión de gerencia.';
    end if;

    update oportunidades set comercial_id = p_comercial_id, updated_at = now()
     where id = v_oportunidad.id;
    update cuentas set comercial_id = p_comercial_id, cartera_desde = current_date
     where id = v_oportunidad.cuenta_id;
  end if;

  update leads
     set asignado_a = p_comercial_id,
         asignado_por = auth.uid(),
         asignado_at = now(),
         updated_at = now()
   where id = p_lead_id;

  return v_oportunidad.id;
end $$;

comment on function redirigir_lead(uuid, uuid) is
  'Corrige una derivación equivocada de Central: mueve lead, oportunidad y cuenta al comercial correcto. Se niega si el comercial anterior ya cotizó, ya gestionó o el cliente ya era suyo — eso es un traspaso de cartera y lo decide gerencia (migración 0079).';

revoke all on function redirigir_lead(uuid, uuid) from public;
grant execute on function redirigir_lead(uuid, uuid) to authenticated;
