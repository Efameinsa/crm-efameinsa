-- ════════════════════════════════════════════════════════════════════════
-- 0514 · Herramientas para resolver sin arreglar la base a mano
--
-- Santos, 16-10: «mapear las observaciones de Central y postventa y buscarle
-- una funcionalidad para que el administrador lo pueda resolver». Del buzón
-- (149 observaciones del 06 al 16-10), 41 se resolvieron tocando la base a
-- mano. Las que esta migración convierte en botones:
--
-- 1. DEVOLVER A LA BANDEJA (Central, 15-10 PRO-11077 y 16-10 PRO-11084): un
--    contacto mal derivado vuelve a «por repartir» como si no se hubiera
--    derivado. Usa el registro de acciones (0513): deshace el clic de la
--    derivación entera (prospecto, asignación, expediente, ficha y contactos
--    que creó, y la cartera si la movió) y le avisa al comercial. Si el
--    comercial ya gestionó, no se pierde nada: se explica que primero hay que
--    mover sus gestiones al expediente correcto.
--
-- 2. MOVER GESTIONES A OTRO EXPEDIENTE (Caravedo 09-10, Costa del Sol,
--    PRO-11084, seguimiento en el cliente equivocado de Gabriela 12-10): las
--    gestiones, los prospectos y las visitas de un expediente pasan a otro
--    (de la misma ficha o de otra). El expediente que queda vacío pasa a
--    histórico sin próxima acción, para no dejar tareas fantasma.
--
-- 3. UNIR FICHAS CON RUC LAS DOS (Choquehuanca 06-10): «Unir fichas» se
--    negaba si la que se une tenía RUC. Gerencia y administración ahora lo
--    pueden hacer (lo deciden ellos); los demás siguen con la regla de antes.
-- ════════════════════════════════════════════════════════════════════════

-- ── El motor de deshacer, separado de quién puede usarlo ──────────────────
-- deshacer_lote (0513) tenía el permiso adentro. Ahora el motor es
-- deshacer_lote_motor (sin permiso, nadie lo llama desde la pantalla) y cada
-- puerta pone su regla: deshacer_lote para admin/gerencia/operaciones,
-- devolver_a_bandeja para Central.
do $$
declare v_def text := pg_get_functiondef('public.deshacer_lote(bigint, text)'::regprocedure);
begin
  v_def := replace(v_def, 'FUNCTION public.deshacer_lote(', 'FUNCTION public.deshacer_lote_motor(');
  v_def := replace(v_def, $q$  if coalesce(rol_actual()::text, '') not in ('admin', 'gerencia', 'operaciones') then
    raise exception 'Deshacer lo pueden hacer administración, gerencia u operaciones. Pídaselo a ellos.';
  end if;
$q$, '');
  if position('Pídaselo a ellos' in v_def) > 0 then
    raise exception 'deshacer_lote cambió: revisar el motor a mano';
  end if;
  execute v_def;
end $$;
revoke all on function public.deshacer_lote_motor(bigint, text) from public, anon, authenticated;

create or replace function public.deshacer_lote(p_lote bigint, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(rol_actual()::text, '') not in ('admin', 'gerencia', 'operaciones') then
    raise exception 'Deshacer lo pueden hacer administración, gerencia u operaciones. Pídaselo a ellos.';
  end if;
  return deshacer_lote_motor(p_lote, p_motivo);
end;
$$;

-- ── 1. Devolver a la bandeja ─────────────────────────────────────────────
create or replace function public.devolver_a_bandeja(p_lead uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead    leads%rowtype;
  v_lote    bigint;
  v_opp     uuid;
  v_gest    integer;
  v_cot     integer;
  v_otros   integer;
  v_res     text;
begin
  if coalesce(rol_actual()::text, '') not in ('central', 'admin', 'gerencia', 'operaciones') then
    raise exception 'Devolver a la bandeja lo hace Central (o administración, gerencia u operaciones).';
  end if;
  select * into v_lead from leads where id = p_lead;
  if v_lead.id is null then raise exception 'Ese contacto no existe.'; end if;
  if v_lead.estado = 'pendiente_triaje' then raise exception 'Ese contacto ya está en la bandeja, por repartir.'; end if;

  -- El clic de la derivación: el que sacó al prospecto de la bandeja.
  select r.lote into v_lote
    from registro_acciones r
   where r.tabla = 'leads' and r.fila_id = p_lead and r.operacion = 'cambiar'
     and r.antes ->> 'estado' = 'pendiente_triaje' and r.deshecha_at is null
   order by r.id desc limit 1;
  if v_lote is null then
    raise exception 'No encuentro el clic de esta derivación en el registro de acciones (empezó el 16-10). Si se derivó antes, pídalo a administración por el buzón del CRM.';
  end if;

  -- ¿El comercial ya trabajó el expediente que nació con la derivación? Sus
  -- gestiones no se borran: primero se mueven a donde corresponde.
  select r.fila_id into v_opp
    from registro_acciones r
   where r.lote = v_lote and r.tabla = 'oportunidades' and r.operacion = 'crear'
   limit 1;
  if v_opp is not null then
    select count(*) into v_gest from actividades
     where oportunidad_id = v_opp
       and not exists (select 1 from registro_acciones r where r.lote = v_lote and r.tabla = 'actividades' and r.fila_id = actividades.id);
    select count(*) into v_cot from cotizaciones where oportunidad_id = v_opp;
    if v_gest > 0 or v_cot > 0 then
      raise exception 'El comercial ya trabajó este contacto (% gestión(es)%). Para no perderlo, primero use «Mover gestiones» en su expediente y páselas al expediente correcto; después vuelva a devolverlo a la bandeja.',
        v_gest, case when v_cot > 0 then format(' y %s cotización(es)', v_cot) else '' end;
    end if;
  end if;

  -- Si después de derivar alguien más tocó este prospecto, no se pisa.
  select count(*) into v_otros from registro_acciones r
   where r.tabla = 'leads' and r.fila_id = p_lead and r.lote > v_lote and r.deshecha_at is null and r.revierte_lote is null;
  if v_otros > 0 then
    raise exception 'Después de derivarlo, este contacto se volvió a cambiar % vez(veces). Revíselo en «Registro de acciones» (administración) antes de devolverlo.', v_otros;
  end if;

  v_res := deshacer_lote_motor(v_lote, 'Devuelto a la bandeja: ' || btrim(coalesce(p_motivo, '')));

  -- Al comercial que lo tenía, que no se quede esperando un contacto que ya no es suyo.
  if v_lead.asignado_a is not null then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (v_lead.asignado_a, 'derivacion_retirada', format('Derivación retirada · %s', coalesce(v_lead.codigo, 'contacto')),
            format('Central devolvió a la bandeja a %s: %s', coalesce(v_lead.nombre_contacto, v_lead.razon_social, 'el contacto'), btrim(p_motivo)), null);
  end if;
  return format('%s volvió a la bandeja, por repartir. %s', coalesce(v_lead.codigo, 'El contacto'), v_res);
end;
$$;
grant execute on function public.devolver_a_bandeja(uuid, text) to authenticated;

-- ── 2. Mover gestiones a otro expediente ─────────────────────────────────
create or replace function public.mover_gestiones(p_desde uuid, p_hacia uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_desde  oportunidades%rowtype;
  v_hacia  oportunidades%rowtype;
  v_n_act  integer;
  v_n_lead integer;
  v_n_vis  integer;
  v_docs   text;
  v_nombre text;
  v_cli    text;
begin
  if v_yo is null then raise exception 'Sesión no válida'; end if;
  if coalesce(rol_actual()::text, '') not in ('central', 'admin', 'gerencia', 'operaciones') then
    raise exception 'Mover gestiones lo hacen Central, operaciones, gerencia o administración. Pídaselo a ellos.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué se mueven (mínimo una frase): lo va a leer el comercial.';
  end if;
  if p_desde = p_hacia then raise exception 'Elija otro expediente: es el mismo.'; end if;
  select * into v_desde from oportunidades where id = p_desde for update;
  select * into v_hacia from oportunidades where id = p_hacia for update;
  if v_desde.id is null or v_hacia.id is null then raise exception 'Uno de los dos expedientes no existe.'; end if;

  -- Los papeles con el cliente impreso no se mudan: saldrían a nombre de otro.
  select string_agg(t, ', ') into v_docs from (
    select 'cotizaciones' t where exists (select 1 from cotizaciones where oportunidad_id = p_desde)
    union all select 'cierres' where exists (select 1 from informes_cierre where oportunidad_id = p_desde)
    union all select 'pedidos' where exists (select 1 from servicios_postventa where oportunidad_id = p_desde)
    union all select 'casos de postventa' where exists (select 1 from atenciones where oportunidad_id = p_desde)
    union all select 'ventas' where exists (select 1 from ventas where oportunidad_id = p_desde)
  ) x;
  if v_docs is not null and v_desde.cuenta_id is distinct from v_hacia.cuenta_id then
    raise exception 'Este expediente tiene % con este cliente impreso: no se mueven a otra ficha. Si es el mismo cliente partido en dos fichas, únalas con «Unir fichas»; si no, se anulan y se rehacen en la ficha correcta.', v_docs;
  end if;

  update actividades set oportunidad_id = p_hacia where oportunidad_id = p_desde;
  get diagnostics v_n_act = row_count;
  update leads set oportunidad_id = p_hacia, cuenta_id = v_hacia.cuenta_id, updated_at = now() where oportunidad_id = p_desde;
  get diagnostics v_n_lead = row_count;
  update visitas_planta set oportunidad_id = p_hacia, cuenta_id = v_hacia.cuenta_id where oportunidad_id = p_desde;
  get diagnostics v_n_vis = row_count;

  select nombre into v_nombre from perfiles where id = v_yo;
  select razon_social into v_cli from cuentas where id = v_desde.cuenta_id;
  insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
  values (p_hacia, 'nota',
          format('%s movió a este expediente %s gestión(es)%s de %s: %s',
                 coalesce(v_nombre, 'Administración'), v_n_act,
                 case when v_n_lead > 0 then format(' y %s contacto(s)', v_n_lead) else '' end,
                 case when v_desde.cuenta_id = v_hacia.cuenta_id then 'otro expediente del mismo cliente' else format('la ficha %s', coalesce(v_cli, '(sin nombre)')) end,
                 btrim(p_motivo)),
          v_yo, now());

  -- El que quedó vacío no se queda pidiendo seguimiento.
  if v_docs is null and not exists (select 1 from actividades where oportunidad_id = p_desde) then
    update oportunidades
       set etapa = 'historico', proxima_accion = null, proxima_accion_at = null, proxima_accion_hora = null,
           cerrada_at = coalesce(cerrada_at, now()), updated_at = now()
     where id = p_desde;
  end if;

  if v_hacia.comercial_id is not null and v_hacia.comercial_id <> v_yo then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (v_hacia.comercial_id, 'gestiones_movidas', 'Le movieron gestiones a un expediente suyo',
            format('%s: %s', coalesce(v_nombre, 'Administración'), btrim(p_motivo)), format('/comercial/oportunidades/%s', p_hacia));
  end if;
  if v_desde.comercial_id is not null and v_desde.comercial_id <> v_yo and v_desde.comercial_id is distinct from v_hacia.comercial_id then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (v_desde.comercial_id, 'gestiones_movidas', 'Se movieron gestiones de un expediente suyo a otro',
            format('%s: %s', coalesce(v_nombre, 'Administración'), btrim(p_motivo)), null);
  end if;

  return format('Listo: %s gestión(es)%s%s pasaron al otro expediente.%s', v_n_act,
                case when v_n_lead > 0 then format(', %s contacto(s)', v_n_lead) else '' end,
                case when v_n_vis > 0 then format(' y %s visita(s)', v_n_vis) else '' end,
                case when v_docs is null then ' El expediente de origen quedó en histórico.' else '' end);
end;
$$;
grant execute on function public.mover_gestiones(uuid, uuid, text) to authenticated;

-- ── 3. Unir fichas con RUC las dos: lo decide gerencia/administración ─────
do $$
declare
  v_def text := pg_get_functiondef('public.fusionar_cuentas(uuid, uuid, text, text)'::regprocedure);
  v_viejo text := $q$if coalesce(nullif(btrim(v_origen.num_doc), ''), '') <> '' and v_origen.tipo_doc <> 'SIN_DOC' then$q$;
  v_nuevo text := $q$if coalesce(nullif(btrim(v_origen.num_doc), ''), '') <> '' and v_origen.tipo_doc <> 'SIN_DOC'
     and coalesce(rol_actual()::text, '') not in ('gerencia', 'admin') then$q$;
begin
  if position('not in (''gerencia'', ''admin'') then' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'fusionar_cuentas cambió: revisar el parche del RUC a mano';
    end if;
    v_def := replace(v_def, v_viejo, v_nuevo);
    v_def := replace(v_def, 'no se une a ciegas, revísela a mano', 'unir dos fichas que tienen RUC lo decide gerencia: pídaselo a gerencia o a administración');
    execute v_def;
  end if;
end $$;
