-- ============================================================
-- CRM EFAMEINSA · Migración 0094 · Las condiciones comerciales de cada ficha
-- ============================================================
-- El estándar de maquetación de las fichas (ESTANDAR-FICHA-COTIZACION.md, que
-- entregó Darwin el 27-08 en tres carpetas: lavadoras y secadoras, coches y
-- prensa de planchado) cierra CADA ficha de producto con una tabla de cinco
-- columnas:
--
--     Precio | Tiempo de entrega | Garantía | Forma de pago | Saldo
--
-- El precio ya lo tiene el ítem. Los otros cuatro datos no existían en ninguna
-- parte: hoy viven revueltos dentro del texto libre `cotizaciones.condiciones`
-- —«Entrega: Inmediata. Garantía de 24 meses.»— que se imprime como párrafo en
-- la última página. De ahí no se puede armar una tabla: cada comercial lo
-- escribe distinto (hay 8 redacciones para la misma condición).
--
-- Por eso pasan a ser cuatro campos propios. El texto libre se queda como
-- estaba: sigue siendo el lugar donde poner una cláusula que no entre en la
-- tabla.
--
-- ------------------------------------------------------------
-- POR QUÉ VAN EN LA COTIZACIÓN Y NO EN EL ÍTEM
-- ------------------------------------------------------------
-- La tabla se imprime por ficha, así que podrían ser por ítem. No lo son
-- porque en el negocio son una sola condición para todo el documento: los dos
-- ejemplos del estándar con valores distintos (24 meses / 30 % O.C. en la
-- prensa; 12 meses / contado en el coche) son DOS cotizaciones diferentes, no
-- dos ítems de la misma. Si algún día hacen falta por equipo, se agregan en
-- `cotizacion_items` sin tocar esto.
--
-- ------------------------------------------------------------
-- POR QUÉ NO SE TOCA crear_cotizacion NI editar_cotizacion
-- ------------------------------------------------------------
-- Esas dos funciones ya se rompieron tres veces por copiarlas dentro de una
-- migración nueva (la última, esta misma mañana: la 0088 revivió la búsqueda
-- de precio piso por tier y la srta. Ariana terminó pidiendo aprobación de
-- gerencia sin haber bajado ningún precio — ver la 0091). Estos cuatro campos
-- no participan del cálculo de precios ni del correlativo, así que se guardan
-- con un UPDATE desde la aplicación, igual que `entrega_lugar` desde el 24-08
-- (`guardarEntrega` en src/lib/acciones/cotizaciones.ts).

alter table cotizaciones
  add column if not exists tiempo_entrega text,
  add column if not exists garantia       text,
  add column if not exists forma_pago     text,
  add column if not exists saldo          text;

comment on column cotizaciones.tiempo_entrega is
  'Columna «Tiempo de entrega» de la tabla de condiciones de cada ficha (0094).';
comment on column cotizaciones.garantia is
  'Columna «Garantía» de la tabla de condiciones de cada ficha (0094).';
comment on column cotizaciones.forma_pago is
  'Columna «Forma de pago» de la tabla de condiciones de cada ficha (0094).';
comment on column cotizaciones.saldo is
  'Columna «Saldo» de la tabla de condiciones de cada ficha (0094). No se imprime
   en las fichas de coches y accesorios: ese juego de columnas es de cuatro.';

-- ------------------------------------------------------------
-- LO QUE YA ESTÁ ESCRITO
-- ------------------------------------------------------------
-- Las cotizaciones vivas se rellenan leyendo su propio texto de condiciones,
-- que en la práctica solo dice dos cosas: cuándo se entrega y cuánto dura la
-- garantía. Lo que no diga queda en NULL y la ficha imprime el valor por
-- defecto, no una celda inventada.
update cotizaciones
   set tiempo_entrega = case
         when condiciones ~* 'entrega\s*:?\s*inmediat' then 'Inmediata'
         when condiciones ~* 'entrega\s*:?\s*(\d+)\s*d[ií]as' then
           (regexp_match(condiciones, 'entrega\s*:?\s*(\d+)\s*d[ií]as', 'i'))[1] || ' días útiles'
         else null
       end,
       garantia = case
         when condiciones ~* 'garant[ií]a[^.]*?(\d+)\s*mes' then
           (regexp_match(condiciones, 'garant[ií]a[^.]*?(\d+)\s*mes', 'i'))[1] || ' meses'
         when condiciones ~* 'garant[ií]a\s*de\s*f[áa]brica' then 'Garantía de fábrica'
         else null
       end
 where condiciones is not null
   and tiempo_entrega is null
   and garantia is null;
