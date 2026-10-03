-- ============================================================
-- «Busca lavadora doméstica»
-- ============================================================
-- Los comerciales, 01-10: muchos de los que escriben buscan una lavadora de
-- casa, y al cerrar la oportunidad no hay dónde decirlo. «Solo consultaba /
-- sin intención» es falso —sí quiere comprar, pero no lo que vendemos— y
-- «Datos falsos / spam» le dice a Google y a Meta que el contacto era basura,
-- cuando lo que falla es el anuncio que lo trajo.
--
-- Separarlo sirve para dos cosas: medir cuántos leads de campaña son de
-- público doméstico (palabras negativas en Google Ads) y no castigar al
-- comercial por un lead que nunca pudo vender.
--
-- Las tres pantallas que ofrecen el motivo leen este catálogo con
-- `activo = true` y ordenan por nombre: aparece sola, sin desplegar código.
-- Id fijo para que la nube y la base local tengan el mismo.

insert into catalogo_motivos_rechazo (id, nombre, activo, solo_postventa, requiere_nota)
select 2525, 'Busca lavadora doméstica (no industrial)', true, false, false
 where not exists (
   select 1 from catalogo_motivos_rechazo
    where id = 2525 or lower(nombre) = lower('Busca lavadora doméstica (no industrial)')
 );

select setval('catalogo_motivos_rechazo_id_seq',
              greatest((select last_value from catalogo_motivos_rechazo_id_seq), 2525));
