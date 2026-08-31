-- ============================================================================
-- 0130 · El archivo del Excel deja de contar como trabajo del día
--
-- EL RECLAMO (Brenda, C1). Abre «Mi día» y la agenda le dice 1.035 gestiones
-- VENCIDAS. Las de verdad son 41. Las otras 994 son filas del Excel que ella
-- llenó entre 2021 y 2025 y que nadie volvió a tocar: el CRM las cuenta como
-- pendientes de hoy porque no sabe distinguir «lo que estoy trabajando» de
-- «lo que archivé». Lo mismo le pasa a Katerine (13.645 abiertas, 377 reales)
-- y a Ariana (5.888 abiertas, 237 reales).
--
-- DE DÓNDE SALE. Del 18 al 21 de agosto se importaron los Excel históricos de
-- los comerciales (scripts/extraer-oportunidades-historicas.mjs y compañía).
-- Cada fila entró como una oportunidad, y su estado del Excel —una etiqueta
-- congelada el día que el comercial la tocó por última vez— se tradujo literal
-- a `etapa`. El CRM define «abierta» como `etapa not in ('venta','rechazada',
-- 'derivada')`, así que 20.443 etiquetas muertas pasaron a ser trabajo vivo:
-- 11.456 «filtrada», 6.877 «seguimiento», 1.266 «cotizada», 844 «asignada».
-- Del total de 21.234 oportunidades abiertas hoy, solo 791 son trabajo real.
--
-- Ya pasó una versión chica de esto el 29-08 con los «potenciales fósiles»
-- (scripts/sanear-potenciales-fosiles.mjs): mismo origen, mismo razonamiento,
-- otra escala.
--
-- POR QUÉ UN ESTADO Y NO UN FILTRO. Acá ya hubo DOS incidentes graves por
-- filtros invisibles: el `origen = 'crm'` del Kanban y el de «Mi día» dejaron
-- las pantallas en blanco y nadie entendía por qué (docs/11, docs/19 §7). Un
-- estado se ve: la oportunidad dice «Histórico» en su badge, sale en la ficha
-- del cliente, tiene su propia pestaña en «Mis oportunidades» y un botón para
-- devolverla al trabajo. Nada desaparece sin explicación.
--
-- QUÉ ES UN FÓSIL (criterio verificado con Santos, 31-08):
--   · origen = 'historico_excel', y
--   · hoy cuenta como abierta (etapa not in venta/rechazada/derivada), y
--   · NADIE la tocó dentro del CRM desde el 18-08: sin cotización propia en
--     `cotizaciones`, sin `cierre_proyectado`, y su última `realizada_at` de
--     `actividades` es anterior al 18-08 (o no tiene ninguna).
--
-- LO QUE NO SE TOCA, y es la mitad del trabajo: las 791 abiertas que quedan.
-- 665 son de origen histórico pero alguien las trabajó DENTRO del CRM —Ariana
-- tiene negociaciones que cotizó el 27 y el 28 de agosto—; 126 nacieron en el
-- CRM. Mandarlas al histórico sería borrarle el pipeline real a la gente.
--
-- NO SE BORRA NADA. El cliente sigue en la cartera de su comercial, la
-- oportunidad conserva sus actividades y su historial completo, y el botón
-- «Trabajar esta oportunidad» la devuelve a `seguimiento` en un clic dejando
-- constancia de quién la reactivó.
--
-- ESTA MIGRACIÓN NO MUEVE NINGUNA FILA. Solo abre el estado y enseña al CRM a
-- no contarlo como pendiente. El movimiento de datos lo hace, aparte y con
-- respaldo, `scripts/sanear-oportunidades-fosiles.mjs --aplicar`.
--
-- ⚠️ Las funciones se parchan con regexp SOBRE LA DEFINICIÓN VIVA (pg_get_
-- functiondef), nunca copiando el cuerpo de una migración vieja: copiar cuerpos
-- revivió reglas ya revertidas tres veces en este repo.
-- ============================================================================

-- ── 1. El estado nuevo ──────────────────────────────────────────────────────
-- Va al final del enum: el orden del enum no manda en ninguna pantalla (las
-- listas de etapas están escritas a mano en el front), y agregarlo al final es
-- lo único que no reescribe el tipo.
alter type etapa_oportunidad add value if not exists 'historico';


-- ── 2. «Abierta» ya no incluye al archivo ───────────────────────────────────
-- Cuatro funciones definen qué es una oportunidad abierta con el mismo patrón
-- literal. Se parchan todas de una pasada sobre su definición viva, y si
-- alguna no trae el patrón esperado la migración FALLA en vez de dejar el
-- sistema a medias.
do $parche$
declare
  v_oid      oid;
  v_nombre   text;
  v_def      text;
  v_nuevo    text;
  v_esperado int;
  v_hechos   int;
  -- Cuántas veces aparece el patrón en cada función. Está escrito acá para que
  -- un cambio futuro en cualquiera de ellas rompa esto ruidosamente en vez de
  -- parchar la mitad en silencio.
  v_cuantos  jsonb := jsonb_build_object(
    'listar_clientes',           1,
    'reporte_diario_comercial',  2,
    'supervision_diaria',        1,
    'resumen_gerencia',          4
  );
  c_viejo constant text := 'not in \(\s*''venta''\s*,\s*''rechazada''\s*,\s*''derivada''\s*\)';
  c_nuevo constant text := 'not in (''venta'', ''rechazada'', ''derivada'', ''historico'')';
begin
  for v_oid, v_nombre in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (select jsonb_object_keys(v_cuantos))
    order by p.proname
  loop
    v_def := pg_get_functiondef(v_oid);

    -- Idempotencia: si ya está parchada, seguir de largo.
    if v_def ~ 'not in \(\s*''venta''\s*,\s*''rechazada''\s*,\s*''derivada''\s*,\s*''historico''\s*\)'
       and v_def !~ c_viejo then
      raise notice '0130: % ya estaba parchada', v_nombre;
      continue;
    end if;

    v_esperado := (v_cuantos ->> v_nombre)::int;
    v_hechos   := (select count(*) from regexp_matches(v_def, c_viejo, 'g'));
    if v_hechos <> v_esperado then
      raise exception
        '0130: %() trae % ocurrencias de «not in (venta,rechazada,derivada)» y se esperaban %. '
        'Alguien cambió la función: revisar a mano antes de parchar.',
        v_nombre, v_hechos, v_esperado;
    end if;

    v_nuevo := regexp_replace(v_def, c_viejo, c_nuevo, 'g');
    execute v_nuevo;
    raise notice '0130: %() parchada (% ocurrencias)', v_nombre, v_hechos;
  end loop;
end
$parche$;


-- ── 3. «Mis oportunidades»: el histórico se ve solo si se pide ──────────────
-- listar_oportunidades() no filtraba por etapa cerrada (lista todo y deja
-- elegir con p_etapa), así que sin esto el archivo se comería la vista «Todas».
-- La regla: el histórico aparece ÚNICAMENTE cuando se pide la pestaña
-- «Histórico». Es la pestaña la que lo hace visible, no un filtro escondido.
do $parche$
declare
  v_oid   oid;
  v_def   text;
  v_nuevo text;
  c_ancla constant text := 'and (p_etapa is null or o.etapa = p_etapa::etapa_oportunidad)';
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'listar_oportunidades';
  if v_oid is null then
    raise exception '0130: no existe public.listar_oportunidades';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('coalesce(p_etapa, '''') = ''historico''' in v_def) > 0 then
    raise notice '0130: listar_oportunidades ya estaba parchada';
    return;
  end if;
  if position(c_ancla in v_def) = 0 then
    raise exception '0130: listar_oportunidades no trae el filtro de etapa esperado';
  end if;

  v_nuevo := replace(
    v_def,
    c_ancla,
    c_ancla || E'\n' ||
    '      -- El archivo del Excel (0130) solo sale cuando se pide su pestaña.' || E'\n' ||
    '      and (coalesce(p_etapa, '''') = ''historico'' or o.etapa <> ''historico'')'
  );
  execute v_nuevo;
  raise notice '0130: listar_oportunidades parchada';
end
$parche$;

-- contar_oportunidades_por_etapa() NO se toca a propósito: agrupa por etapa,
-- así que «historico» aparece solo, con su número, como una pestaña más. Es
-- justo lo que se quiere — el comercial ve cuántas archivó y entra a buscarlas.


-- ── 4. No se le proyecta cierre a algo que está en el archivo ───────────────
-- proyectar_cierre() rechaza las cerradas con «ya está cerrada». Una histórica
-- no está cerrada: está guardada. El aviso tiene que decir qué hacer.
do $parche$
declare
  v_oid   oid;
  v_def   text;
  c_ancla constant text := 'if v_op.etapa in (';
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'proyectar_cierre';
  if v_oid is null then
    raise exception '0130: no existe public.proyectar_cierre';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('''historico''' in v_def) > 0 then
    raise notice '0130: proyectar_cierre ya estaba parchada';
    return;
  end if;
  if position(c_ancla in v_def) = 0 then
    raise exception '0130: proyectar_cierre no trae el control de etapa esperado';
  end if;

  execute replace(
    v_def,
    c_ancla,
    'if v_op.etapa = ''historico'' then' || E'\n' ||
    '    raise exception ''Esta oportunidad está en el histórico. Primero use «Trabajar esta oportunidad» y después proyéctele el cierre.'';' || E'\n' ||
    '  end if;' || E'\n' ||
    '  ' || c_ancla
  );
  raise notice '0130: proyectar_cierre parchada';
end
$parche$;


-- ── 5. El botón «Trabajar esta oportunidad» ─────────────────────────────────
-- Sacar del archivo es una decisión, no un tecleo: queda escrito quién la tomó
-- y cuándo. La actividad de tipo `nota` es lo que hace que el historial del
-- cliente lo cuente igual que cualquier otra gestión.
--
-- Permisos: el dueño de la oportunidad o backoffice (gerencia/admin), la misma
-- regla que proyectar_cierre y que la RLS de `oportunidades`. Con coalesce()
-- alrededor de es_backoffice() por la trampa de la 0127: `if not funcion()` no
-- entra cuando la función devuelve null.
create or replace function trabajar_oportunidad_historica(p_oportunidad uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_op   record;
  v_hoy  date := (now() at time zone 'America/Lima')::date;
  v_quien text;
begin
  select id, comercial_id, etapa, proxima_accion
    into v_op
    from oportunidades
   where id = p_oportunidad;

  if v_op.id is null then
    raise exception 'La oportunidad no existe';
  end if;
  if not coalesce(v_op.comercial_id = auth.uid() or es_backoffice(), false) then
    raise exception
      'Solo el comercial dueño de la oportunidad o gerencia pueden sacarla del histórico. '
      'Está entrando con %.', coalesce((select nombre from perfiles where id = auth.uid()), 'una cuenta sin perfil');
  end if;
  if v_op.etapa <> 'historico' then
    raise exception 'Esta oportunidad no está en el histórico: ya se está trabajando (%).', v_op.etapa;
  end if;

  select coalesce(nombre, 'alguien') into v_quien from perfiles where id = auth.uid();

  update oportunidades
     set etapa             = 'seguimiento',
         proxima_accion    = coalesce(nullif(trim(coalesce(proxima_accion, '')), ''), 'Retomar contacto'),
         proxima_accion_at = v_hoy,
         updated_at        = now()
   where id = p_oportunidad;

  insert into actividades (oportunidad_id, tipo, nota, realizada_por, proxima_accion, proxima_accion_at)
  values (
    p_oportunidad,
    'nota',
    format(
      'Reactivada desde el histórico por %s el %s. Venía del archivo de los Excel (importación 18 al 21-08) '
      'y no se había tocado dentro del CRM; vuelve a seguimiento con la próxima acción para hoy.',
      coalesce(v_quien, 'alguien'), to_char(v_hoy, 'DD/MM/YYYY')
    ),
    auth.uid(),
    coalesce(nullif(trim(coalesce(v_op.proxima_accion, '')), ''), 'Retomar contacto'),
    v_hoy
  );
end;
$$;

comment on function trabajar_oportunidad_historica(uuid) is
  'Devuelve una oportunidad archivada (etapa historico, 0130) al trabajo diario: '
  'seguimiento + próxima acción para hoy, con la nota de quién la reactivó.';

revoke all on function trabajar_oportunidad_historica(uuid) from public;
grant execute on function trabajar_oportunidad_historica(uuid) to authenticated;


-- ── 6. Al traspasar una cartera, el archivo se va con el cliente ────────────
-- reasignar_cartera() mueve las oportunidades por lista blanca de etapas. Sin
-- esto, gerencia le pasa un cliente a otro comercial y sus oportunidades
-- archivadas se quedan con el anterior: el nuevo dueño abre la ficha y las ve
-- rotuladas «de C5 · solo lectura», sin poder retomar ninguna. El archivo es
-- parte de la cartera, no historia cerrada — las cerradas de verdad (venta,
-- rechazada, derivada) siguen quedándose donde están, que es la regla vieja.
do $parche$
declare
  v_oid   oid;
  v_def   text;
  c_ancla constant text := $ancla$and etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')$ancla$;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reasignar_cartera';
  if v_oid is null then
    raise exception '0130: no existe public.reasignar_cartera';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('''historico''' in v_def) > 0 then
    raise notice '0130: reasignar_cartera ya estaba parchada';
    return;
  end if;
  if position(c_ancla in v_def) = 0 then
    raise exception '0130: reasignar_cartera no trae la lista de etapas esperada';
  end if;

  execute replace(
    v_def,
    c_ancla,
    $nuevo$and etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial', 'historico')$nuevo$
  );
  raise notice '0130: reasignar_cartera parchada';
end
$parche$;
