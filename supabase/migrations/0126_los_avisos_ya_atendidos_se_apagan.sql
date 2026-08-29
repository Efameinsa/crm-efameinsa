-- ============================================================
-- CRM EFAMEINSA · Migración 0126 · Los avisos ya atendidos se apagan
-- ============================================================
-- Reclamo de Brenda del 29-08: la campana marcaba 2 pendientes y al abrirla
-- no había nada que atender.
--
-- Eran dos prospectos que le derivaron el lunes 24-08 (Nelfa Romero y
-- auridexis diaz). Los DOS los llamó: el 25-08 y otra vez el 26-08 («no
-- contestó, insistir mañana»). El trabajo estaba hecho — pero entró por la
-- agenda y no por la campana, así que el aviso nunca se marcó como leído. Y
-- como encima le llegaron 45 avisos más nuevos encima, quedaron fuera de las
-- 15 que muestra el desplegable: número encendido, lista en gris.
--
-- De aquí en adelante el aviso se apaga solo (código de la app):
--   · al entrar a la pantalla a la que el aviso apuntaba, y
--   · al registrar una gestión sobre esa oportunidad, venga de donde venga.
--
-- Esta migración hace lo mismo hacia atrás, UNA vez: apaga los avisos de
-- oportunidades que ya tienen gestión registrada después del aviso. No toca
-- los que siguen sin atender — esos deben seguir encendidos, que para eso son.

with atendidos as (
  select n.id
    from notificaciones n
    join oportunidades o
      on n.url = '/comercial/oportunidades/' || o.id::text
   where n.leida_at is null
     and exists (
       select 1 from actividades a
        where a.oportunidad_id = o.id
          and a.realizada_at >= n.created_at
     )
)
update notificaciones
   set leida_at = now()
 where id in (select id from atendidos);
