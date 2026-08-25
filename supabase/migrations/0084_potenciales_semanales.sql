-- ============================================================
-- CRM EFAMEINSA · Migración 0084 · Potenciales semanales
-- ============================================================
-- Reunión 25-08, ing. Carlos, textual: «El concepto de potencial es semanal,
-- normalmente lo vemos en un cuadro: en esta semana, el martes vas a cerrar
-- el cliente A con $20,000, el miércoles tienes proyectado $10,000… día a
-- día, 1-3 clientes por día. […] Si no lo cierras, lo pasas al siguiente día
-- y lo jalas, pero tiene que estar en la semana. […] Al final tienes
-- proyectado cerrar para esta semana 50 mil dólares».
--
-- Lo único que faltaba en el modelo es LA FECHA PROYECTADA DE CIERRE: la
-- etapa «potencial» ya existe (74 oportunidades hoy) y el monto sale de la
-- cotización enviada. Esta columna es esa fecha, y la función es la única
-- puerta para moverla (el comercial dueño o el backoffice).

alter table oportunidades add column if not exists cierre_proyectado date;
create index if not exists ix_oportunidades_cierre_proyectado
  on oportunidades (cierre_proyectado) where cierre_proyectado is not null;

comment on column oportunidades.cierre_proyectado is
  'Fecha en la que el comercial proyecta cerrar la venta (cuadro semanal de potenciales, reunión 25-08). Se mueve con proyectar_cierre().';

create or replace function proyectar_cierre(p_oportunidad uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op record;
begin
  select id, comercial_id, etapa into v_op from oportunidades where id = p_oportunidad;
  if v_op.id is null then
    raise exception 'La oportunidad no existe';
  end if;
  if not (v_op.comercial_id = auth.uid() or es_backoffice()) then
    raise exception 'Solo el comercial dueño o gerencia pueden proyectar el cierre';
  end if;
  if v_op.etapa in ('venta', 'rechazada', 'derivada') then
    raise exception 'Esta oportunidad ya está cerrada: no se le proyecta cierre';
  end if;
  -- p_fecha null = quitar la proyección (dejó de ser potencial de la semana).
  update oportunidades set cierre_proyectado = p_fecha, updated_at = now()
   where id = p_oportunidad;
end;
$$;

revoke all on function proyectar_cierre(uuid, date) from public;
grant execute on function proyectar_cierre(uuid, date) to authenticated;
