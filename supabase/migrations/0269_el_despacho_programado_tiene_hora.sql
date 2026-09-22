-- EL DESPACHO PROGRAMADO LLEVA HORA (22-09-2026).
--
-- Reunión de Carlos con Lesly y Rubí mirando el calendario de postventa:
-- «Solamente falta ponerle hora. La hora, sí, la hora. Porque no sale con
-- el color que indica el despacho». Un despacho sin hora caía en «por
-- programar» del día en vez de ocupar su franja, y el almacén no sabía si
-- preparar la carga a las 10 o a las 4.

alter table servicios_postventa
  add column if not exists despacho_hora time;

comment on column servicios_postventa.despacho_hora is
  'Hora a la que postventa programó el despacho (0269). Sin hora, el calendario lo muestra en «por programar» del día.';
