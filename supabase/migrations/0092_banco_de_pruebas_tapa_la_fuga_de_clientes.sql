-- ============================================================
-- CRM EFAMEINSA · Migración 0092 · La última puerta que quedaba abierta
-- ============================================================
-- La 0088 separó en dos mundos las cinco tablas del área, y la comprobación con
-- sesión real confirmó que la cuenta de práctica no ve NI UNA fila real de la
-- agenda, los equipos, los informes ni los cierres.
--
-- Pero veía 51 CLIENTES en vez de los 10 suyos. La puerta era esta función, que
-- la 0081 creó para algo razonable —que postventa pueda abrir la ficha del
-- cliente al que le está atendiendo un caso— y que mira `servicios_postventa` y
-- `soporte_tecnico` SIN preguntar de qué mundo son. Como la cuenta de práctica
-- tiene el perfil de postventa, cualquier cliente con un despacho real le
-- abría su ficha: razón social, RUC, dirección y contactos de 41 clientes de
-- verdad.
--
-- No es un problema de la 0088: es que su regla tenía que llegar también acá.
-- La lección para lo que venga: una separación por marca vale lo que valga su
-- eslabón más flojo, y los eslabones son todas las funciones `security definer`
-- que consultan esas tablas por su cuenta.
--
-- La primera condición no se toca: ya está acotada a `auth.uid()`, y una
-- oportunidad de la cuenta de práctica solo puede estar sobre un cliente suyo.

create or replace function postventa_tiene_caso(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from oportunidades o
            where o.cuenta_id = p_cuenta and o.comercial_id = auth.uid()
         )
      or exists (
           select 1 from servicios_postventa s
            where s.cuenta_id = p_cuenta and s.es_prueba = es_cuenta_prueba()
         )
      or exists (
           select 1 from soporte_tecnico s
            where s.cuenta_id = p_cuenta and s.es_prueba = es_cuenta_prueba()
         )
$$;

comment on function postventa_tiene_caso is
  'Si postventa tiene un caso, un despacho o un informe sobre esta cuenta, puede abrir su ficha. Respeta la separación entre el banco de pruebas y el dato real (migraciones 0081 y 0092).';
