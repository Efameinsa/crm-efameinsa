-- ============================================================
-- CRM EFAMEINSA · Migración 0064 · El número se gasta al enviar, y se aprueba por ítem
-- ============================================================
-- Dos pedidos del ing. Carlos en la reunión del 24-08 por la tarde.
--
-- 1) UN BORRADOR NO DEBE QUEMAR UN NÚMERO.
--    «¿En borrador genera número de cotización? … Si es no, mejora. … Porque
--    en borrador, es más, a veces desiste: "no señorita, disculpe, me
--    equivoqué, yo no quiero tal producto, quiero el otro".»
--
--    Hoy el correlativo se asigna al INSERTAR (migración 0038). Cada borrador
--    descartado deja un hueco en la serie, y el cliente recibe el Presu_2185
--    sin que hayan existido nunca el 2183 ni el 2184. Es la misma queja de
--    gerencia sobre los presupuestos en papel, por el otro lado: allá se
--    repetían números, acá se saltan. Las dos cosas rompen lo mismo — que el
--    correlativo signifique algo ante la contadora.
--
--    Ya resolvimos esto una vez, para el informe de cierre (migración 0050).
--    Se aplica el mismo criterio, palabra por palabra: el documento nace sin
--    número y editable, `emitir_cotizacion()` le asigna el correlativo una
--    sola vez y lo congela. Antes de eso el PDF sale marcado "BORRADOR", para
--    que no exista manera de confundir un borrador con lo que se le mandó al
--    cliente.
--
-- 2) APROBACIÓN POR ÍTEM.
--    «Me despliega en los 5 ítems. El ítem 1 solamente quiere aprobar, porque
--    los otros 4 le están mandando el precio normal. El ítem 1, que estaba en
--    5 mil, quiere en 4 mil. Yo pongo OK.»
--
--    La cotización ya sabe QUÉ ítem va bajo lista: `cotizacion_items.bajo_lista`
--    se calcula contra el precio piso del tier desde la migración 0010. Lo que
--    faltaba era que gerencia pudiera resolverlos uno por uno en vez de aceptar
--    o rechazar el documento entero. El motivo por el que importa lo dio el
--    propio Carlos: «en las LG ellos tienen un tope mínimo … la diferencia es
--    bastante, unos 600 dólares, en algunos casos 800».
--
--    No hace falta que el comercial marque nada: pedir aprobación de un ítem ES
--    ponerle un precio bajo el piso. Los otros cuatro no se piden porque van al
--    precio normal, exactamente como lo describió Carlos.

-- ── 1. El correlativo se asigna al enviar ───────────────────────────────────
drop trigger if exists trg_cotizaciones_correlativo on cotizaciones;
drop function if exists asignar_correlativo_cotizacion();

comment on column cotizaciones.correlativo is
  'NULL mientras es borrador. Lo asigna emitir_cotizacion(); un número se gasta cuando el documento sale al cliente, no mientras se arma (migración 0064).';

-- La identidad del documento sigue siendo intocable, con una sola excepción:
-- el paso de NULL al número que le asigna emitir_cotizacion(). Un número ya
-- puesto no se mueve nunca más.
create or replace function bloquear_edicion_cotizacion()
returns trigger language plpgsql as $$
declare
  v_editable boolean := old.estado = 'borrador' and old.enviada_at is null;
begin
  if new.serie is distinct from old.serie
     or new.oportunidad_id is distinct from old.oportunidad_id
     or new.creada_por is distinct from old.creada_por
     or new.created_at is distinct from old.created_at
     or (old.correlativo is not null and new.correlativo is distinct from old.correlativo)
     or (old.codigo is not null and new.codigo is distinct from old.codigo)
  then
    raise exception 'La serie, el número y el cliente de una cotización no se cambian.';
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
  then
    raise exception 'Esta cotización ya salió al cliente y no se modifica. Duplíquela para hacer una versión nueva.';
  end if;

  return new;
end;
$$;

create or replace function emitir_cotizacion(p_cotizacion_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cot         cotizaciones%rowtype;
  v_correlativo integer;
  v_codigo      text;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  -- La función es security definer: se salta RLS, así que la autorización se
  -- repite acá a mano (misma regla que la política cotizaciones_update).
  if not exists (
    select 1 from oportunidades o
    where o.id = v_cot.oportunidad_id
      and (o.comercial_id = auth.uid() or es_backoffice())
  ) then
    raise exception 'Solo el comercial dueño de la oportunidad puede enviarla';
  end if;

  -- Enviar dos veces le daría dos números al mismo documento.
  if v_cot.estado <> 'borrador' or v_cot.enviada_at is not null then
    raise exception 'Esta cotización ya fue enviada al cliente';
  end if;

  if v_cot.estado_aprobacion = 'pendiente_gerencia' then
    raise exception 'Gerencia todavía no aprueba los precios bajo lista de esta cotización';
  end if;
  if v_cot.estado_aprobacion = 'rechazada_gerencia' then
    raise exception 'Gerencia rechazó los precios de esta cotización; corríjala antes de enviarla';
  end if;

  if not exists (select 1 from cotizacion_items where cotizacion_id = p_cotizacion_id) then
    raise exception 'La cotización necesita al menos un equipo';
  end if;

  v_correlativo := siguiente_correlativo_anual(v_cot.serie::text);
  -- El código impreso lleva el año, como los documentos de la empresa
  -- ("Presu_2177-26"): un número de este año no se confunde con el mismo
  -- número del año pasado.
  v_codigo := 'Presu_' || v_correlativo::text || '-' ||
              to_char((now() at time zone 'America/Lima'), 'YY');

  update cotizaciones
     set correlativo = v_correlativo,
         codigo      = v_codigo,
         estado      = 'enviada',
         enviada_at  = now()
   where id = p_cotizacion_id;

  return v_codigo;
end;
$fn$;

revoke all on function emitir_cotizacion(uuid) from public;
grant execute on function emitir_cotizacion(uuid) to authenticated;

comment on function emitir_cotizacion(uuid) is
  'Envía la cotización al cliente y recién ahí le asigna el correlativo oficial. Un borrador descartado no deja hueco en la serie (migración 0064).';

-- ── 2. Aprobación por ítem ──────────────────────────────────────────────────
alter table cotizacion_items
  add column if not exists aprobado boolean;

comment on column cotizacion_items.aprobado is
  'Decisión de gerencia sobre ESTE equipo: true aprobado, false rechazado, NULL sin decidir (o al precio de lista, que no necesita aprobación). Migración 0064.';

-- Editar el borrador reemplaza los ítems, así que las decisiones anteriores se
-- van con ellos: un precio nuevo se vuelve a evaluar desde cero.
create or replace function resolver_aprobacion_cotizacion(
  p_cotizacion_id uuid,
  p_aprobados     uuid[],
  p_rechazados    uuid[],
  p_nota          text default null
)
returns estado_aprobacion
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cot         cotizaciones%rowtype;
  v_sin_decidir integer;
  v_resultado   estado_aprobacion;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;

  if not es_backoffice() then
    raise exception 'Solo gerencia aprueba precios bajo lista';
  end if;

  if v_cot.estado_aprobacion <> 'pendiente_gerencia' then
    raise exception 'Esta cotización ya fue resuelta';
  end if;

  -- Todo equipo bajo lista tiene que quedar decidido: si gerencia no se
  -- pronuncia sobre uno, el comercial no sabría a qué precio puede vender.
  select count(*) into v_sin_decidir
    from cotizacion_items ci
   where ci.cotizacion_id = p_cotizacion_id
     and ci.bajo_lista
     and not (ci.id = any(coalesce(p_aprobados, '{}'::uuid[])))
     and not (ci.id = any(coalesce(p_rechazados, '{}'::uuid[])));
  if v_sin_decidir > 0 then
    raise exception 'Faltan % equipo(s) por aprobar o rechazar', v_sin_decidir;
  end if;

  update cotizacion_items set aprobado = true
   where cotizacion_id = p_cotizacion_id and id = any(coalesce(p_aprobados, '{}'::uuid[]));
  update cotizacion_items set aprobado = false
   where cotizacion_id = p_cotizacion_id and id = any(coalesce(p_rechazados, '{}'::uuid[]));

  -- Un solo equipo rechazado devuelve el documento entero: la cotización sale
  -- como una sola pieza y el comercial tiene que corregir ese precio.
  v_resultado := (case
    when coalesce(array_length(p_rechazados, 1), 0) > 0 then 'rechazada_gerencia'
    else 'aprobada_gerencia'
  end)::estado_aprobacion;

  update cotizaciones
     set estado_aprobacion = v_resultado,
         aprobada_por      = auth.uid(),
         aprobada_at       = now(),
         nota_gerencia     = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_cotizacion_id;

  return v_resultado;
end;
$fn$;

revoke all on function resolver_aprobacion_cotizacion(uuid, uuid[], uuid[], text) from public;
grant execute on function resolver_aprobacion_cotizacion(uuid, uuid[], uuid[], text) to authenticated;

-- Los ítems los edita `editar_cotizacion` (borrador) y ahora también
-- `resolver_aprobacion_cotizacion`. El trigger de inmutabilidad de la 0062
-- bloquea el UPDATE de una cotización ya enviada — pero la aprobación ocurre
-- siempre en borrador, así que no hace falta tocarlo.
