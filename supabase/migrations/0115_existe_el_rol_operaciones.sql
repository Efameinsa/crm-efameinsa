-- ============================================================
-- CRM EFAMEINSA · Migración 0115 · Existe el rol «operaciones»
-- ============================================================
-- «Ella no es una comercial. De ahora en adelante su cuenta será operaciones»
-- (Darwin, 28-08, después de la reunión con gerencia).
--
-- Hasta ahora Lesly era `comercial` con marcas encima, y el sistema la trataba
-- como tal: su menú abría con ocho pantallas de comercial que le salían vacías
-- —no tiene cartera ni código— y aterrizaba en una de ellas. Parchar eso con
-- más marcas es seguir mintiendo en la base para acomodarlo en la pantalla.
-- Operaciones es un puesto, no una variante de comercial: le toca su rol.
--
-- VA SOLA EN SU MIGRACIÓN. Postgres no deja usar un valor de enum recién
-- agregado dentro de la misma transacción que lo agregó; si esto viajara junto
-- al resto, el `update perfiles set rol = 'operaciones'` fallaría con «unsafe
-- use of new value». Por eso son dos archivos: acá nace el valor y en la 0116
-- se usa.

alter type rol_usuario add value if not exists 'operaciones';
