-- Por qué esta migración: «se reportan demoras al ingreso de bandeja las
-- llamadas de prospectos» (Central, 28-08, ejemplo: EDGAR LINO CUTIPA MAMANI).
--
-- No era la red ni el navegador. Mientras Central escribe el nombre en la
-- captura, la pantalla busca si ese cliente ya es de alguien —para no derivarlo
-- dos veces— con un `ilike '%token%'` sobre cuentas y contactos. Ese scan, medido
-- contra la base sin políticas, tarda 20 ms. Medido con la sesión de Central,
-- tardaba 2.325 ms. La diferencia entera estaba acá:
--
--   cuentas_postventa_select:   puede_postventa() and postventa_tiene_caso(id)
--   contactos_postventa_select: puede_postventa() and postventa_tiene_caso(cuenta_id)
--
-- `puede_postventa()`, `es_postventa()` y `es_cuenta_prueba()` no dependen de la
-- fila: dan lo mismo para las 16.275 cuentas. Pero escritas así, sueltas, el
-- planificador las trata como parte del filtro de cada fila y las ejecuta UNA VEZ
-- POR FILA — y cada una de ellas consulta `perfiles`. Escribir un nombre de tres
-- palabras disparaba cerca de 90.000 consultas internas, en serie, cada vez que
-- Central hacía una pausa al teclear. Eso es la demora que ella siente.
--
-- Envueltas en `(select …)` pasan a ser un InitPlan: se calculan una sola vez por
-- consulta y el resto de la condición ni se evalúa cuando dan falso. Es el mismo
-- patrón que ya usaban todas las demás políticas del sistema (cuentas_backoffice,
-- leads_central, oportunidades_central); estas dos quedaron fuera cuando se
-- agregó postventa. No cambia QUIÉN VE QUÉ: la condición es idéntica, cambia
-- cuántas veces se pregunta.
--
-- `postventa_tiene_caso(...)` sí depende de la fila y se queda como está: ahora
-- solo se ejecuta para quien de verdad es postventa.

drop policy if exists cuentas_postventa_select on cuentas;
create policy cuentas_postventa_select on cuentas for select to authenticated
using (
  ((select puede_postventa()) and postventa_tiene_caso(id))
  or ((select es_postventa()) and not (select es_cuenta_prueba()))
);

drop policy if exists contactos_postventa_select on contactos;
create policy contactos_postventa_select on contactos for select to authenticated
using (
  ((select puede_postventa()) and postventa_tiene_caso(cuenta_id))
  or ((select es_postventa()) and not (select es_cuenta_prueba()))
);

-- Y el scan en sí. Con las políticas ya baratas quedan los 20 ms del recorrido
-- completo de la tabla, que hoy no molestan pero crecen con la cartera: 16.275
-- cuentas hoy, y cada nombre que Central escribe las recorre tres veces. Con
-- trigramas la búsqueda «%CUTIPA%» deja de recorrer todo.
create extension if not exists pg_trgm;
create index if not exists ix_cuentas_razon_social_trgm on cuentas using gin (razon_social gin_trgm_ops);
create index if not exists ix_contactos_nombre_trgm on contactos using gin (nombre gin_trgm_ops);
