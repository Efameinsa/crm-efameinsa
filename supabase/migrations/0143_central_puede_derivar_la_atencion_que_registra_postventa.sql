-- ============================================================
-- CRM EFAMEINSA · Migración 0143 · Central puede derivar la atención de postventa
-- ============================================================
-- Central lo reportó el 01-09 con la pantalla al lado: abre el contacto que
-- postventa registró, toca «Asignar» y le salta un error en rojo:
--
--   «El lead PRO-09095 no es comercial (área: servicio_tecnico); no se asigna,
--    se deriva»
--
-- No es un caso raro: es TODO lo que postventa registre. La 0132 (31-08) hizo
-- lo que pidió Lesly —«cualquier caso que venga, que reciba posventa, tiene que
-- ser derivado a Central»— y `registrar_atencion_postventa` manda esos leads a
-- la bandeja de triaje con `area_destino = 'servicio_tecnico'`. Pero
-- `asignar_lead` es de la 0002 y trae una regla escrita cuando esa puerta no
-- existía: si el área no es comercial, no se asigna.
--
-- Resultado: el circuito que Lesly pidió llega hasta la bandeja de Central y
-- ahí se muere. El contacto queda pendiente para siempre y postventa nunca
-- recibe el caso de vuelta. Hoy solo hay uno atascado y es de práctica, porque
-- el circuito se estrenó el 31-08 y el primero en usarlo fue la capacitación —
-- el primer caso real de Ariana o Hever habría chocado igual.
--
-- LA REGLA CORRECTA es la de estar en la cola: `estado = 'pendiente_triaje'`
-- SIGNIFICA «esto lo reparte Central». Lo que no le toca repartir —RR. HH.,
-- proveedores, administración— nunca entra en ese estado (`registrarContacto`
-- lo deja en `derivado_area`), así que la comprobación de estado, que está
-- justo encima, ya lo frena. La comprobación de área se queda igual para todo
-- lo demás: solo deja pasar la pista que la 0132 abrió a propósito.
--
-- DE PASO, LA FICHA GEMELA. `asignar_lead` vuelve a buscar al cliente por
-- documento o teléfono aunque el lead ya sepa de qué ficha salió. Para un
-- contacto de la calle está bien —es lo único que hay—, pero una atención de
-- postventa nace SOBRE una ficha concreta (`p_cuenta` en la 0132), y si esa
-- ficha no tiene RUC o el contacto no tiene teléfono cargado, la búsqueda no
-- la encuentra y se crea una ficha nueva del mismo cliente. Eso es exactamente
-- la ficha partida que venimos limpiando desde el 21-08. Cuando el lead trae
-- `cuenta_id`, manda esa.

do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'asignar_lead' limit 1;
  if v_def is null then
    raise exception 'No existe la función asignar_lead';
  end if;

  -- 1. La atención que registra postventa también se reparte desde la bandeja.
  v_nuevo := replace(
    v_def,
    '  if v_lead.area_destino <> ''comercial'' then',
    '  -- La 0132 manda a esta misma cola las atenciones que registra postventa'
    || E'\n' || '  -- (area_destino = ''servicio_tecnico''): estar en `pendiente_triaje` ES la'
    || E'\n' || '  -- definición de «esto lo reparte Central». Lo que no le toca repartir sale'
    || E'\n' || '  -- de la cola por otro estado y lo frena la comprobación de arriba (0143).'
    || E'\n' || '  if v_lead.area_destino not in (''comercial'', ''servicio_tecnico'') then'
  );
  if v_nuevo = v_def then
    raise exception 'No se encontró la comprobación de area_destino en asignar_lead';
  end if;
  v_def := v_nuevo;

  -- 2. Si el lead ya sabe de qué ficha salió, esa es la ficha.
  v_nuevo := replace(
    v_def,
    '  select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
  from cuentas c
  where (v_lead.num_doc is not null',
    '  -- Una atención de postventa nace sobre una ficha concreta (0132): esa es'
    || E'\n' || '  -- la ficha, no una que se parezca. Buscarla otra vez por documento o'
    || E'\n' || '  -- teléfono es lo que abre la ficha gemela cuando el cliente no tiene RUC'
    || E'\n' || '  -- cargado o el contacto no tiene teléfono (0143).'
    || E'\n' || '  if v_lead.cuenta_id is not null then'
    || E'\n' || '    select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual'
    || E'\n' || '      from cuentas c where c.id = v_lead.cuenta_id;'
    || E'\n' || '  end if;'
    || E'\n'
    || E'\n' || '  if v_cuenta_id is null then'
    || E'\n' || '  select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
  from cuentas c
  where (v_lead.num_doc is not null'
  );
  if v_nuevo = v_def then
    raise exception 'No se encontró la búsqueda de cuenta en asignar_lead';
  end if;
  v_def := v_nuevo;

  -- …y se cierra ese `if` justo antes del que decide si el cliente es nuevo.
  v_nuevo := replace(
    v_def,
    '  limit 1;

  if v_cuenta_id is null then
    -- Cliente nuevo.',
    '  limit 1;
  end if;

  if v_cuenta_id is null then
    -- Cliente nuevo.'
  );
  if v_nuevo = v_def then
    raise exception 'No se encontró el cierre de la búsqueda de cuenta en asignar_lead';
  end if;

  execute v_nuevo;
end $$;

comment on function asignar_lead(uuid, uuid, motivo_asignacion, tipo_postventa) is
  'Central reparte lo que está en la bandeja de triaje: los contactos comerciales y las '
  'atenciones que registra postventa (0132/0143). Si el lead ya trae cuenta_id, se usa esa '
  'ficha en vez de volver a buscar al cliente.';
