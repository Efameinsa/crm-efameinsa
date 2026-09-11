-- ============================================================
-- CRM EFAMEINSA · Migración 0225 · Dejar de ser potencial saca la oportunidad de la semana
-- ============================================================
-- Brenda (C1), 11-09: «ya modifiqué que no es potencial pero no se borra».
-- SUMINISTROS Y SERVICIOS MONTENEGRO, US$ 29.499, proyectada para el jueves
-- 10: la pasó de «Potencial» a «En seguimiento» y el cuadro de la semana la
-- siguió mostrando en rojo, «No cerró — jalarlo a otro día».
--
-- POR QUÉ. El cuadro (0084) mete dos cosas: toda oportunidad en etapa
-- potencial, y cualquier otra abierta con fecha proyectada dentro de la
-- semana. Al cambiar la etapa, la fecha se quedaba puesta —ninguna pantalla
-- la quitaba— y por la segunda regla la tarjeta no se iba nunca.
--
-- LA REGLA. La fecha proyectada se puso siendo potencial: si el comercial
-- dice que ya no lo es, la proyección se retira con ella. Si más adelante
-- quiere volver a comprometerla, le pone fecha otra vez desde el cuadro
-- (eso sigue valiendo para «cotizada» o «seguimiento», como quiso Carlos el
-- 25-08: «un cotizada que ya se comprometió a cerrar cuenta igual»). Y una
-- oportunidad que se cierra —rechazada, derivada, histórico, venta— no
-- proyecta nada.
--
-- Va como trigger y no en la app porque la etapa se cambia desde tres sitios
-- (la ficha, el kanban y la gestión rápida) y el cuadro los lee a todos.
-- ============================================================

create or replace function public.quitar_proyeccion_al_dejar_potencial()
returns trigger
language plpgsql
as $$
begin
  if new.etapa is distinct from old.etapa and (
       old.etapa = 'potencial'
       or new.etapa in ('rechazada', 'derivada', 'historico', 'venta')
     ) then
    new.cierre_proyectado := null;
    new.cotizacion_proyectada := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_quitar_proyeccion_al_dejar_potencial on oportunidades;
create trigger trg_quitar_proyeccion_al_dejar_potencial
  before update of etapa on oportunidades
  for each row
  execute function public.quitar_proyeccion_al_dejar_potencial();

comment on function public.quitar_proyeccion_al_dejar_potencial() is
  'Al salir de «potencial» (o cerrarse), la oportunidad pierde su fecha proyectada de cierre y sale del cuadro de la semana (0225, caso Brenda 11-09).';
