-- LA LISTA NO OFRECE LO QUE NO SE PUEDE ABRIR.
--
-- «Cuando le doy a clientes que atiendo y presiono cualquier cliente me sale
-- "Esto ya no se puede mostrar"» (Santos, 08-09, mirando la cuenta de práctica
-- del tester).
--
-- Eran dos criterios distintos para la misma pregunta:
--
--   · La LISTA la arma `listar_clientes`, que es security definer y se salta
--     RLS: a cualquier postventa le devolvía los 482 clientes reales.
--   · La FICHA lee la tabla `cuentas` con RLS, y su regla dice que una cuenta
--     de PRÁCTICA solo ve los clientes que tienen un caso suyo
--     (`postventa_tiene_caso`), nunca la cartera real.
--
-- Resultado: 482 filas ofrecidas y ninguna que abriera. Y además la cartera
-- real se asomaba dentro del entorno de práctica, que es justo lo que la
-- cuenta de prueba existe para no hacer.
--
-- Se arregla en la lista y no en la ficha: RLS tiene razón —una cuenta de
-- práctica no debe leer clientes reales— y quien mentía era el listado. Ahora
-- la lista pregunta EXACTAMENTE lo mismo que RLS, así que no pueden volver a
-- discrepar.
--
-- Al postventa de verdad no le cambia nada: `es_cuenta_prueba()` es falso para
-- él y la condición se cumple sola. Y a un comercial de práctica tampoco: sus
-- propios clientes entran por `c.comercial_id = p_comercial`, que va aparte.
--
-- Se parcha la definición VIVA con un reemplazo comprobado, nunca copiándola.

do $$
declare
  def text;
  antes text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'listar_clientes';
  if def is null then
    raise exception 'No existe listar_clientes: nada que parchar';
  end if;

  antes := def;
  def := replace(
    def,
    'or (v_postventa and (',
    'or (v_postventa'
      || E'\n            -- La cuenta de práctica no ve la cartera real: solo lo que RLS'
      || E'\n            -- la deja abrir. Si no, la lista ofrece filas que dan «esto ya no'
      || E'\n            -- se puede mostrar» (Santos, 08-09).'
      || E'\n            and (not es_cuenta_prueba() or postventa_tiene_caso(c.id)) and ('
  );
  if def = antes then raise exception 'No encontré la rama de postventa en listar_clientes'; end if;

  execute def;
end $$;
