-- ============================================================
-- CRM EFAMEINSA · Migración 0072 · Una cuenta para probar sin ensuciar nada
-- ============================================================
-- Pedido del 24-08: una cuenta de vendedor de prueba «C0» con unos pocos
-- registros sintéticos, «para no malograr las cuentas de los vendedores
-- haciendo pruebas», y que las estadísticas de gerencia NO la consideren. Y
-- que Central pueda derivarle un lead para oír el sonido «sin que eso manche
-- los números de Central».
--
-- POR QUÉ HACE FALTA UN MARCADOR Y NO BASTA CON BORRAR DESPUÉS. Hasta hoy las
-- pruebas se hacían sobre cuentas reales y había que limpiarlas a mano — ya
-- pasó dos veces: las del fin de semana y los ejemplos de la capacitación de
-- esta mañana, que hubo que rastrear uno por uno y separar del trabajo real.
-- Con un marcador, lo de prueba nunca entra en los números y no hay nada que
-- limpiar.
--
-- SE MARCA A LA PERSONA Y AL LEAD, y son dos cosas distintas:
--   · `perfiles.es_prueba` deja fuera todo lo que haga ese vendedor.
--   · `leads.es_prueba` deja fuera el contacto ANTES de que se derive. Hace
--     falta aparte porque el lead vive un rato en la bandeja de Central sin
--     dueño todavía, y sin marcarlo contaría como carga de Central en ese
--     tramo — que es justo lo que se pidió evitar.

alter table perfiles add column if not exists es_prueba boolean not null default false;
alter table leads    add column if not exists es_prueba boolean not null default false;

comment on column perfiles.es_prueba is
  'Cuenta para practicar. Su trabajo no entra en ningún indicador de gerencia ni de Central (migración 0072).';
comment on column leads.es_prueba is
  'Contacto sintético, creado para probar. No cuenta como carga de Central ni de nadie (migración 0072).';

create index if not exists ix_leads_reales on leads (estado) where not es_prueba;

-- ------------------------------------------------------------
-- Gerencia: el resumen y la supervisión dejan de ver la cuenta de práctica.
-- ------------------------------------------------------------
-- Las dos funciones recorren `perfiles p where p.rol = 'comercial' and p.activo`
-- para armar el detalle por comercial. En vez de copiar acá sus cuerpos —que
-- son largos y han cambiado varias veces— se toma la definición VIVA y se le
-- agrega la condición. Si el texto esperado no estuviera, se levanta el error
-- en vez de aplicar la migración sin efecto: una exclusión que falla en
-- silencio es peor que no tenerla, porque nadie se entera de que los números
-- siguen sucios.
do $$
declare
  v_nombre text;
  v_def    text;
  v_nuevo  text;
begin
  foreach v_nombre in array array['resumen_gerencia', 'supervision_diaria']
  loop
    select pg_get_functiondef(oid) into v_def from pg_proc where proname = v_nombre limit 1;
    if v_def is null then
      raise exception 'No existe la función %', v_nombre;
    end if;
    v_nuevo := replace(
      v_def,
      'where p.rol = ''comercial'' and p.activo',
      'where p.rol = ''comercial'' and p.activo and not p.es_prueba'
    );
    if v_nuevo = v_def then
      raise exception 'No se encontró el filtro de comerciales en %: revisar a mano', v_nombre;
    end if;
    execute v_nuevo;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Central: su informe del día deja de contar los contactos sintéticos.
-- ------------------------------------------------------------
-- Mismo criterio: se parte de la definición viva y se exige que el cambio
-- surta efecto.
do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'informe_central' limit 1;
  if v_def is null then
    raise exception 'No existe la función informe_central';
  end if;
  v_nuevo := replace(v_def, 'from leads l', 'from leads l');
  -- Las tres consultas de leads del informe se filtran de una vez envolviendo
  -- la tabla: `leads` pasa a leerse ya sin los de prueba.
  v_nuevo := replace(v_nuevo, 'from leads l', 'from (select * from leads where not es_prueba) l');
  if v_nuevo = v_def then
    raise exception 'No se encontraron las consultas de leads en informe_central: revisar a mano';
  end if;
  execute v_nuevo;
end $$;
