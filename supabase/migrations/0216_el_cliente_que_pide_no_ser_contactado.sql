-- ============================================================
-- «Solicitó ya no ser contactado»
-- ============================================================
-- Ariana, 10-09: tiene un prospecto que le pidió expresamente que no lo
-- vuelvan a llamar, y al ir a cerrar la oportunidad no hay dónde decirlo. Los
-- ocho motivos que existen le hacen decir otra cosa: «No responde / silencio»
-- es falso —contestó, y fue claro—, y «Solo consultaba / sin intención» le
-- inventa una intención que él nunca declaró.
--
-- La diferencia no es de matiz. Un «no responde» se vuelve a intentar; un
-- «proyecto postergado» se agenda para dentro de seis meses. Este NO se
-- reintenta: el cliente pidió que no lo llamemos, y esa es la única de las
-- nueve razones que obliga a la empresa a algo.
--
-- Va para TODOS los comerciales, no solo para postventa: las tres pantallas que
-- ofrecen el motivo leen este catálogo con `activo = true` y ordenan por
-- nombre, así que con esto aparece sola en las tres.
--
-- OJO, LO QUE ESTO TODAVÍA NO HACE: queda escrito en el expediente, pero no
-- impide por sí solo que otra campaña lo vuelva a marcar. Marcar la ficha para
-- que la ruta y «Las ventas de la empresa» lo salteen es la mitad que falta y
-- se decide aparte.

insert into catalogo_motivos_rechazo (nombre, activo)
select 'Solicitó ya no ser contactado', true
 where not exists (
   select 1 from catalogo_motivos_rechazo
    where lower(nombre) = lower('Solicitó ya no ser contactado')
 );
