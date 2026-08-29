-- ============================================================
-- CRM EFAMEINSA · Migración 0123 · Corregir una cotización sin cambiarle el número
-- ============================================================
-- Pedido del ing. Carlos en la reunión del 28-08, con el reparto que confirmó
-- Lesly (operaciones) el 29-08. Diseño completo en
-- `docs/20-corregir-cotizacion-numerada.md`.
--
-- EL PROBLEMA. Una cotización emitida gasta un número de su serie, ese número
-- sale al cliente —y muchas veces al banco— y hasta hoy la única salida ante un
-- error era emitir otra, que sale con el número siguiente:
--
--   «no puedes variar el número, sobre todo mucho ocurre con el banco, que es
--    leasing, y tenemos varios leasing. Al banco no le puedes dar otra
--    numeración. Un número más, se demora un mes más en que salga la
--    operación. Le tienes que dar exactamente el mismo número.»
--
-- Pasa 5 a 10 veces al año sobre unas 3.000 cotizaciones.
--
-- ESTO NO ABRE LA EDICIÓN. La migración 0012 congeló las cotizaciones porque
-- gerencia pidió lo contrario en su momento: «les ha pasado que el mismo número
-- de cotización se envía al cliente con dos precios distintos» (docs/06). Las
-- dos reglas conviven porque acá NO se edita: se VERSIONA bajo el mismo número.
-- La versión anterior queda archivada entera —equipos, precios, condiciones— y
-- cada corrección deja quién la hizo, quién la autorizó, cuándo y por qué. Si el
-- banco pregunta qué decía el documento que recibió, hay con qué responderle.
--
-- QUIÉN CORRIGE. El comercial dueño del documento, con el código de cuatro
-- dígitos que dictan operaciones o gerencia:
--
--   «Si tu gestor quiere modificar esta cotización, viene el administrador,
--    pone la clave y ya modifica.»
--
-- Y tiene sentido más allá de la autoridad: el comercial es el único que sabe
-- qué pidió el cliente. Operaciones no gana ninguna pantalla — hace lo que ya
-- hace para anular un cierre: dicta el código y después ve para qué se usó.
--
-- EL CÓDIGO SE PIDE PARA ABRIR, NO PARA GUARDAR. Dura diez minutos y elegir el
-- equipo correcto toma más que eso: pedirlo al final significaría que se vence
-- a mitad de camino y hay que llamar dos veces. Validarlo abre una ventana de
-- media hora para ESA cotización y ESE comercial. Una autorización, una
-- corrección — el código se quema igual que siempre (0093).

-- ------------------------------------------------------------
-- 1. La versión del documento
-- ------------------------------------------------------------
alter table cotizaciones
  add column if not exists version integer not null default 1;

comment on column cotizaciones.version is
  'Cuántas veces salió este número. 1 = como se emitió. La sube corregir_cotizacion_emitida() (migración 0123); el número y la serie no se mueven nunca.';

-- El documento tal como estaba ANTES de la corrección, completo. No es un
-- registro de auditoría de columnas sueltas: es el papel que el cliente tiene
-- en la mano, guardado para poder mostrarlo.
create table if not exists cotizacion_versiones (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references cotizaciones (id) on delete cascade,
  version        integer not null,
  items          jsonb  not null,
  subtotal       numeric(12,2) not null,
  total          numeric(12,2) not null,
  moneda         text not null,
  condiciones    text,
  vigencia_dias  integer,
  entrega_lugar  text,
  tiempo_entrega text,
  garantia       text,
  forma_pago     text,
  saldo          text,
  archivada_at   timestamptz not null default now(),
  constraint uq_version_por_cotizacion unique (cotizacion_id, version)
);
alter table cotizacion_versiones enable row level security;

create index if not exists ix_versiones_cotizacion on cotizacion_versiones (cotizacion_id);

-- Quien ve la cotización ve sus versiones anteriores: el comercial dueño, y el
-- backoffice que ya ve todas.
drop policy if exists versiones_lectura on cotizacion_versiones;
create policy versiones_lectura on cotizacion_versiones
  for select using (
    exists (
      select 1 from cotizaciones c join oportunidades o on o.id = c.oportunidad_id
       where c.id = cotizacion_versiones.cotizacion_id
         and ((select auth.uid()) = o.comercial_id or (select es_backoffice()))
    )
  );

-- ------------------------------------------------------------
-- 2. La ventana de corrección: lo que abre el código
-- ------------------------------------------------------------
-- Es a la vez el permiso y el registro. Una fila sin `guardada_at` es una
-- autorización que se pidió y no se usó — también dice algo, y por eso no se
-- borra.
create table if not exists correcciones_cotizacion (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references cotizaciones (id) on delete cascade,
  solicitante_id uuid not null references perfiles (id),
  autorizo       uuid not null references perfiles (id),
  motivo         text not null,
  abierta_at     timestamptz not null default now(),
  expira_at      timestamptz not null,
  guardada_at    timestamptz,
  -- El antes/después en las frases que va a leer quien autorizó.
  resumen        jsonb,
  es_prueba      boolean not null default false
);
alter table correcciones_cotizacion enable row level security;

create index if not exists ix_correcciones_abiertas
  on correcciones_cotizacion (cotizacion_id, solicitante_id)
  where guardada_at is null;
create index if not exists ix_correcciones_guardadas
  on correcciones_cotizacion (guardada_at desc)
  where guardada_at is not null;

drop policy if exists correcciones_lectura on correcciones_cotizacion;
create policy correcciones_lectura on correcciones_cotizacion
  for select using (
    (select auth.uid()) = solicitante_id
    or (select auth.uid()) = autorizo
    or (select es_backoffice())
  );

-- Media hora. El código dura diez minutos —lo que tarda una llamada— pero
-- corregir es buscar el equipo correcto, mirarlo y revisar el PDF: cerrar la
-- ventana a los diez minutos obligaría a llamar de nuevo a mitad de trabajo.
create or replace function duracion_correccion()
returns interval language sql immutable as $$ select interval '30 minutes' $$;

-- ------------------------------------------------------------
-- 3. Los frenos: qué se lleva por delante corregir esta cotización
-- ------------------------------------------------------------
-- Se consultan ANTES de pedir el código, no después: nadie llama a operaciones
-- para que le autoricen algo que no se va a poder hacer. Mismo criterio que
-- `cierre_en_juego()` al anular un cierre.
create or replace function frenos_correccion_cotizacion(p_cotizacion uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cot      cotizaciones;
  v_cierre   record;
  v_equipos  integer := 0;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion;
  if not found then
    return jsonb_build_object('puede', false, 'motivo', 'Esa cotización no existe');
  end if;

  if not exists (
    select 1 from oportunidades o
     where o.id = v_cot.oportunidad_id
       and (o.comercial_id = auth.uid() or es_backoffice())
  ) then
    return jsonb_build_object('puede', false, 'motivo', 'Esta cotización no es suya');
  end if;

  -- Un borrador se edita sin pedirle permiso a nadie: no gastó número.
  if v_cot.correlativo is null or v_cot.enviada_at is null then
    return jsonb_build_object(
      'puede', false,
      'motivo', 'Todavía es un borrador: se edita sin autorización, desde el cotizador');
  end if;

  -- FRENO 1. Cambiar el monto de algo ya vendido descuadra el cierre y el
  -- récord del comercial. Primero se anula el cierre —procedimiento que ya
  -- existe (0114)— y después se corrige.
  select i.id, i.codigo, i.serie into v_cierre
    from informes_cierre i
   where i.cotizacion_id = p_cotizacion
     and i.emitido_at is not null
     and i.anulado_at is null
   limit 1;

  if v_cierre.id is not null then
    -- FRENO 3, que en la práctica viaja con el 1: postventa solo arranca
    -- después del cierre. Cambiar el equipo del papel no cambia la máquina que
    -- va en el camión, así que se dice cuántas ya están comprometidas.
    select count(*) into v_equipos
      from equipos_instalados e where e.informe_cierre_id = v_cierre.id;

    return jsonb_build_object(
      'puede', false,
      'motivo', format(
        'Esta cotización ya tiene el cierre de venta N.º %s emitido%s. Anule primero el cierre y después corrija.',
        v_cierre.codigo,
        case when v_equipos > 0
             then format(', y postventa ya tiene %s equipo(s) con su serie', v_equipos)
             else '' end),
      'cierre_codigo', v_cierre.codigo);
  end if;

  return jsonb_build_object(
    'puede', true,
    'codigo', v_cot.codigo,
    'serie', v_cot.serie,
    'version', v_cot.version,
    'total', v_cot.total,
    'moneda', v_cot.moneda);
end;
$fn$;

revoke all on function frenos_correccion_cotizacion(uuid) from public;
grant execute on function frenos_correccion_cotizacion(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Abrir la corrección: el motivo primero, después el código
-- ------------------------------------------------------------
create or replace function abrir_correccion_cotizacion(
  p_cotizacion uuid,
  p_motivo     text,
  p_pin        text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien    uuid := auth.uid();
  v_frenos   jsonb;
  v_autorizo uuid;
  v_expira   timestamptz;
  v_nombre   text;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  -- El motivo es lo que el comercial le lee al supervisor por teléfono para
  -- pedirle el código, y lo que va a quedar en la bitácora. Tres palabras no
  -- alcanzan para entender qué pasó dentro de seis meses.
  if length(coalesce(btrim(p_motivo), '')) < 15 then
    raise exception 'Escriba qué está mal en la cotización: es lo que queda en el registro y lo que lee quien autoriza';
  end if;

  v_frenos := frenos_correccion_cotizacion(p_cotizacion);
  if not (v_frenos->>'puede')::boolean then
    raise exception '%', v_frenos->>'motivo';
  end if;

  -- Operaciones o gerencia: el ámbito 'operaciones' es exactamente ese alcance
  -- desde la migración 0116. Acá se quema el código.
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');

  begin
    insert into autorizaciones_supervisor (
      supervisor_id, solicitante_id, ventana, accion, motivo
    ) values (
      v_autorizo, v_quien, ventana_pin_actual(), 'corregir_cotizacion', btrim(p_motivo)
    );
  exception when unique_violation then
    raise exception 'Ese código ya se usó. Cada autorización sirve para una sola corrección: pida uno nuevo.';
  end;

  -- Si había una ventana abierta sin usar para esta cotización, se cierra: la
  -- que vale es la última que se autorizó.
  update correcciones_cotizacion
     set expira_at = now()
   where cotizacion_id = p_cotizacion and guardada_at is null and expira_at > now();

  v_expira := now() + duracion_correccion();

  insert into correcciones_cotizacion (
    cotizacion_id, solicitante_id, autorizo, motivo, expira_at, es_prueba
  ) values (
    p_cotizacion, v_quien, v_autorizo, btrim(p_motivo), v_expira, es_cuenta_prueba()
  );

  select nombre into v_nombre from perfiles where id = v_autorizo;

  return jsonb_build_object(
    'expira_at', v_expira,
    'autorizo', coalesce(v_nombre, 'un supervisor'),
    'minutos', extract(epoch from duracion_correccion()) / 60);
end;
$fn$;

revoke all on function abrir_correccion_cotizacion(uuid, text, text) from public;
grant execute on function abrir_correccion_cotizacion(uuid, text, text) to authenticated;

-- La pantalla necesita saber si la ventana sigue viva para dibujar el reloj —y
-- para no dejar armar una corrección que ya no se va a poder guardar.
create or replace function correccion_abierta(p_cotizacion uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
           'abierta', true,
           'expira_at', c.expira_at,
           'motivo', c.motivo,
           'autorizo', coalesce(p.nombre, 'un supervisor'))
    from correcciones_cotizacion c
    left join perfiles p on p.id = c.autorizo
   where c.cotizacion_id = p_cotizacion
     and c.solicitante_id = auth.uid()
     and c.guardada_at is null
     and c.expira_at > now()
   order by c.abierta_at desc
   limit 1;
$fn$;

revoke all on function correccion_abierta(uuid) from public;
grant execute on function correccion_abierta(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Los triggers de inmutabilidad aprenden una excepción
-- ------------------------------------------------------------
-- Una sola, y con nombre: la bandera `app.corrigiendo_cotizacion` que solo
-- enciende `corregir_cotizacion_emitida()`, que es `security definer` y
-- comprueba la ventana antes. Nadie más la puede encender desde fuera con
-- efecto útil — sin ventana abierta la función no llega a encenderla.
--
-- Es el mismo recurso que usa `anular_cierre` con `app.anulando_cierre` (0114).
create or replace function bloquear_edicion_items_cotizacion()
returns trigger language plpgsql as $$
declare
  v_estado  estado_cotizacion;
  v_enviada timestamptz;
  v_fila    cotizacion_items;
begin
  v_fila := case when tg_op = 'DELETE' then old else new end;

  if coalesce(current_setting('app.corrigiendo_cotizacion', true), '') = 'si' then
    return v_fila;
  end if;

  select c.estado, c.enviada_at into v_estado, v_enviada
  from cotizaciones c
  where c.id = (case when tg_op = 'DELETE' then old.cotizacion_id else new.cotizacion_id end);

  -- El padre ya no existe: es el borrado en cascada de la cotización entera.
  -- No hay documento que proteger.
  if not found then
    return v_fila;
  end if;

  if v_estado = 'borrador' and v_enviada is null then
    return v_fila;
  end if;

  raise exception 'Esta cotización ya salió al cliente: sus equipos no se modifican. Pida una corrección autorizada, o duplíquela.';
end;
$$;

create or replace function bloquear_edicion_cotizacion()
returns trigger language plpgsql as $$
declare
  v_editable   boolean := old.estado = 'borrador' and old.enviada_at is null;
  v_corrigiendo boolean := coalesce(current_setting('app.corrigiendo_cotizacion', true), '') = 'si';
begin
  -- La IDENTIDAD del documento no se mueve NUNCA, y corregir es justamente
  -- para conservarla: si el número pudiera cambiar, todo esto no serviría
  -- para nada.
  if new.serie is distinct from old.serie
     or new.oportunidad_id is distinct from old.oportunidad_id
     or new.creada_por is distinct from old.creada_por
     or new.created_at is distinct from old.created_at
     or (old.correlativo is not null and new.correlativo is distinct from old.correlativo)
     or (old.codigo is not null and new.codigo is distinct from old.codigo)
  then
    raise exception 'La serie, el número y el cliente de una cotización no se cambian.';
  end if;

  -- El cliente tampoco, ni corrigiendo: si el destinatario cambió, eso no es
  -- una corrección, es otro documento.
  if v_corrigiendo then
    if new.cliente_snapshot is distinct from old.cliente_snapshot then
      raise exception 'El cliente de una cotización no se cambia, tampoco corrigiéndola.';
    end if;
    return new;
  end if;

  if v_editable then
    return new;
  end if;

  if new.cliente_snapshot is distinct from old.cliente_snapshot
     or new.subtotal is distinct from old.subtotal
     or new.total is distinct from old.total
     or new.moneda is distinct from old.moneda
     or new.condiciones is distinct from old.condiciones
     or new.vigencia_dias is distinct from old.vigencia_dias
     or new.entrega_lugar is distinct from old.entrega_lugar
  then
    raise exception 'Esta cotización ya salió al cliente y no se modifica. Pida una corrección autorizada si el número no se puede cambiar.';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 6. `editar_cotizacion` acepta la corrección, sin copiarla
-- ------------------------------------------------------------
-- Se toma la definición VIVA y se le cambian dos bloques. Copiar acá una
-- función de 100 líneas que ya se redefinió en 0062, 0064, 0067, 0069, 0074,
-- 0086 y 0088 es como se revivieron reglas revertidas tres veces.
--
-- Bloque A: el portero. Deja pasar una cotización emitida solo mientras la
-- bandera está encendida.
--
-- Bloque B: la aprobación NO se recalcula durante una corrección. Sin esto, un
-- documento cuyo descuento gerencia ya firmó volvería a `pendiente_gerencia` y
-- chocaría contra el check `enviada_requiere_aprobacion` — una cotización
-- enviada no puede quedar pendiente. Lo que impide que la corrección se use
-- para colar un descuento nuevo es la comprobación explícita del punto 7, no
-- este recálculo.
do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'editar_cotizacion' limit 1;
  if v_def is null then
    raise exception 'No existe la función editar_cotizacion';
  end if;

  v_nuevo := regexp_replace(
    v_def,
    'if v_cot\.estado <> ''borrador'' or v_cot\.enviada_at is not null then',
    'if (v_cot.estado <> ''borrador'' or v_cot.enviada_at is not null)'
    || ' and coalesce(current_setting(''app.corrigiendo_cotizacion'', true), '''') <> ''si'' then',
    'g');
  if v_nuevo = v_def then
    raise exception 'No se encontró el portero de editar_cotizacion; revisar antes de seguir';
  end if;
  v_def := v_nuevo;

  v_nuevo := regexp_replace(
    v_def,
    'estado_aprobacion = \(case when v_hay_requiere then ''pendiente_gerencia'' else ''auto_aprobada'' end\)::estado_aprobacion,',
    'estado_aprobacion = (case'
    || ' when coalesce(current_setting(''app.corrigiendo_cotizacion'', true), '''') = ''si'' then estado_aprobacion::text'
    || ' when v_hay_requiere then ''pendiente_gerencia'' else ''auto_aprobada'' end)::estado_aprobacion,',
    'g');
  if v_nuevo = v_def then
    raise exception 'No se encontró el recálculo de aprobación en editar_cotizacion; revisar antes de seguir';
  end if;

  execute v_nuevo;
end $$;

-- ------------------------------------------------------------
-- 7. Corregir: archivar, reescribir, dejar dicho qué cambió
-- ------------------------------------------------------------
create or replace function corregir_cotizacion_emitida(
  p_cotizacion     uuid,
  p_items          jsonb,
  p_condiciones    text default null,
  p_vigencia_dias  integer default null,
  p_entrega_lugar  text default null,
  p_tiempo_entrega text default null,
  p_garantia       text default null,
  p_forma_pago     text default null,
  p_saldo          text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien    uuid := auth.uid();
  v_permiso  correcciones_cotizacion;
  v_cot      cotizaciones;
  v_antes    jsonb;
  v_despues  jsonb;
  v_item     jsonb;
  v_prod     productos;
  v_piso     numeric;
  v_antes_pu numeric;
  v_total_antes numeric;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select * into v_permiso
    from correcciones_cotizacion
   where cotizacion_id = p_cotizacion
     and solicitante_id = v_quien
     and guardada_at is null
     and expira_at > now()
   order by abierta_at desc
   limit 1;

  if not found then
    raise exception 'La autorización para corregir esta cotización venció. Pida un código nuevo a operaciones o gerencia.';
  end if;

  select * into v_cot from cotizaciones where id = p_cotizacion;
  if v_cot.correlativo is null then
    raise exception 'Esa cotización todavía no tiene número: se edita desde el cotizador';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización necesita al menos un equipo';
  end if;

  -- ── Ningún descuento nuevo por esta puerta ──────────────────────────────
  -- Una corrección arregla un error, no negocia el precio. Se deja pasar el
  -- descuento que gerencia YA firmó en este documento y solo mientras no se
  -- ahonde: cualquier otro precio bajo el piso se rechaza acá, con el nombre
  -- del equipo, en vez de dejar que reviente el check de la tabla.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if nullif(v_item->>'producto_id', '') is null then continue; end if;

    select * into v_prod from productos where id = (v_item->>'producto_id')::uuid;
    if not found then continue; end if;

    v_piso := precio_referencia_producto(v_prod.id);
    if v_piso is null or (v_item->>'precio_unitario')::numeric >= v_piso then continue; end if;

    select precio_unitario into v_antes_pu
      from cotizacion_items
     where cotizacion_id = p_cotizacion and producto_id = v_prod.id
     limit 1;

    if v_cot.estado_aprobacion = 'aprobada_gerencia'
       and v_antes_pu is not null
       and (v_item->>'precio_unitario')::numeric >= v_antes_pu then
      continue;
    end if;

    raise exception
      'El % quedaría en % , por debajo del precio de lista (%). Una corrección no aprueba descuentos: ese precio lo tiene que autorizar gerencia antes de emitir.',
      coalesce(v_prod.sku, v_prod.modelo),
      to_char((v_item->>'precio_unitario')::numeric, 'FM999G999D00'),
      to_char(v_piso, 'FM999G999D00');
  end loop;

  -- ── El documento que el cliente tiene hoy, guardado entero ──────────────
  select jsonb_agg(jsonb_build_object(
           'producto_id', i.producto_id,
           'sku', p.sku,
           'nombre', coalesce(p.marca || ' ' || p.modelo || ' — ' || p.nombre, i.descripcion),
           'descripcion', i.descripcion,
           'cantidad', i.cantidad,
           'precio_unitario', i.precio_unitario,
           'color', i.color)
           order by p.sku nulls last)
    into v_antes
    from cotizacion_items i
    left join productos p on p.id = i.producto_id
   where i.cotizacion_id = p_cotizacion;

  v_total_antes := v_cot.total;

  insert into cotizacion_versiones (
    cotizacion_id, version, items, subtotal, total, moneda, condiciones,
    vigencia_dias, entrega_lugar, tiempo_entrega, garantia, forma_pago, saldo
  ) values (
    p_cotizacion, v_cot.version, coalesce(v_antes, '[]'::jsonb), v_cot.subtotal,
    v_cot.total, v_cot.moneda::text, v_cot.condiciones, v_cot.vigencia_dias,
    v_cot.entrega_lugar, v_cot.tiempo_entrega, v_cot.garantia, v_cot.forma_pago, v_cot.saldo
  );

  -- ── La corrección ───────────────────────────────────────────────────────
  perform set_config('app.corrigiendo_cotizacion', 'si', true);

  perform editar_cotizacion(p_cotizacion, p_items, p_condiciones, p_vigencia_dias);

  update cotizaciones set
    version        = version + 1,
    entrega_lugar  = coalesce(p_entrega_lugar,  entrega_lugar),
    tiempo_entrega = nullif(btrim(coalesce(p_tiempo_entrega, '')), ''),
    garantia       = nullif(btrim(coalesce(p_garantia, '')), ''),
    forma_pago     = nullif(btrim(coalesce(p_forma_pago, '')), ''),
    saldo          = nullif(btrim(coalesce(p_saldo, '')), ''),
    updated_at     = now()
  where id = p_cotizacion;

  perform set_config('app.corrigiendo_cotizacion', '', true);

  -- ── Qué cambió, dicho para que se lea ───────────────────────────────────
  select jsonb_agg(jsonb_build_object(
           'producto_id', i.producto_id,
           'sku', p.sku,
           'nombre', coalesce(p.marca || ' ' || p.modelo || ' — ' || p.nombre, i.descripcion),
           'cantidad', i.cantidad,
           'precio_unitario', i.precio_unitario,
           'color', i.color)
           order by p.sku nulls last)
    into v_despues
    from cotizacion_items i
    left join productos p on p.id = i.producto_id
   where i.cotizacion_id = p_cotizacion;

  select * into v_cot from cotizaciones where id = p_cotizacion;

  update correcciones_cotizacion
     set guardada_at = now(),
         resumen = jsonb_build_object(
           'version', v_cot.version,
           'antes',  jsonb_build_object('items', coalesce(v_antes, '[]'::jsonb), 'total', v_total_antes),
           'despues', jsonb_build_object('items', coalesce(v_despues, '[]'::jsonb), 'total', v_cot.total))
   where id = v_permiso.id;

  return jsonb_build_object(
    'codigo', v_cot.codigo,
    'version', v_cot.version,
    'total', v_cot.total,
    'autorizo', (select nombre from perfiles where id = v_permiso.autorizo));
end;
$fn$;

revoke all on function corregir_cotizacion_emitida(uuid, jsonb, text, integer, text, text, text, text, text) from public;
grant execute on function corregir_cotizacion_emitida(uuid, jsonb, text, integer, text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 8. La bitácora de quien dio la llave
-- ------------------------------------------------------------
-- Dictar un código y no volver a saber qué se hizo con él no es autorizar, es
-- adivinar (misma razón que `bitacora_autorizaciones`, 0114). Va en la pantalla
-- que operaciones ya mira todos los días, junto a los cierres anulados: un tipo
-- de fila más, no una sección más.
create or replace function bitacora_correcciones(p_dias integer default 90)
returns table (
  correccion_id uuid, cotizacion_id uuid, codigo text, serie text, cliente text,
  version integer, motivo text, guardada_at timestamptz,
  total_antes numeric, total_despues numeric, moneda text,
  corrigio text, autorizo text, resumen jsonb
)
language sql stable security definer set search_path = public as $fn$
  select c.id, c.cotizacion_id, cot.codigo, cot.serie::text,
         coalesce(cot.cliente_snapshot->>'razon_social', cu.razon_social),
         cot.version, c.motivo, c.guardada_at,
         (c.resumen#>>'{antes,total}')::numeric,
         (c.resumen#>>'{despues,total}')::numeric,
         cot.moneda::text,
         quien.nombre, autoriza.nombre, c.resumen
    from correcciones_cotizacion c
    join cotizaciones cot on cot.id = c.cotizacion_id
    join oportunidades o  on o.id = cot.oportunidad_id
    left join cuentas cu  on cu.id = o.cuenta_id
    left join perfiles quien    on quien.id    = c.solicitante_id
    left join perfiles autoriza on autoriza.id = c.autorizo
   where c.guardada_at is not null
     and c.guardada_at > now() - make_interval(days => greatest(p_dias, 1))
     and c.es_prueba = es_cuenta_prueba()
     and (es_operaciones()
          or (select rol::text from perfiles where id = auth.uid()) in ('gerencia', 'admin', 'central'))
   order by c.guardada_at desc
   limit 200;
$fn$;

revoke all on function bitacora_correcciones(integer) from public;
grant execute on function bitacora_correcciones(integer) to authenticated;
