-- 0370 · El GPS de la app se rastrea a TODAS las cuentas que la usan (con una exclusión por persona)
--
-- Santos (02-10-2026): «¿no se puede rastrear todas las cuentas que instalen la apk?». Hasta la 0363,
-- el rastreo era un piloto para quien gerencia marcaba a mano (`perfiles.trabajo_de_campo`). Con la
-- regla de gerencia —el celular es de la EMPRESA y el GPS va 24/7— ya no hay que marcar a nadie: toda
-- cuenta real que inicia sesión en la app se rastrea, previa aceptación escrita (0368).
--
--   · Las cuentas de práctica (`es_prueba`) y las sesiones de auditoría NO se rastrean, salvo que se
--     marquen a mano con `trabajo_de_campo` (así se prueba).
--   · `rastreo_excluido` es la salida explícita: gerencia deja fuera a quien no corresponda (por
--     ejemplo un directivo con su celular personal) sin tener que desactivar su celular una y otra vez,
--     porque reinstalar la app crearía un celular nuevo. Gana sobre todo lo demás.
--
-- `trabajo_de_campo` sigue valiendo para el aviso del NAVEGADOR del piloto de la 0363.

alter table perfiles
  add column if not exists rastreo_excluido boolean not null default false;

comment on column perfiles.rastreo_excluido is
  'Gerencia la deja fuera del GPS de la app de Android (0370). Gana sobre trabajo_de_campo y sobre la regla de que se rastrea a todas las cuentas reales.';

notify pgrst, 'reload schema';
