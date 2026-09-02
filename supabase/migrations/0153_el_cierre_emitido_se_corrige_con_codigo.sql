-- ============================================================
-- CRM EFAMEINSA · Migración 0153 · El cierre emitido se corrige con código
-- ============================================================
-- Gerencia, Word de observaciones del 01.09, punto 3: «en los cierres, que
-- permita ingresar al cierre y ver el detalle, pero si requiere modificar
-- algo debe solicitar PIN». Santos, 02-09, mirando la pantalla nueva del
-- cierre: «no veo el botón editar (solicitar PIN) para poder editar cualquier
-- parte de dicha vista, que exportará finalmente a un PDF corregido».
--
-- LO QUE HABÍA. Un informe emitido era inmutable (0105/0113): el candado
-- `bloquear_edicion_informe` rechaza cualquier UPDATE que toque algo que no
-- sea adjuntos, y los adjuntos solo se agregan con código (0142). Para
-- arreglar un teléfono mal escrito o un precio con un dígito de más había
-- que ANULAR el cierre con código y emitir otro con número nuevo. Para un
-- error de tipeo, eso es demasiado: el cliente ya tiene el número.
--
-- LO QUE HAY AHORA. La misma puerta que ya existe para las cotizaciones
-- numeradas (0123) y para el expediente (0142): quien emitió el cierre —o
-- Central, gerencia, operaciones— corrige lo que haga falta, dice POR QUÉ
-- (mínimo 15 caracteres, es lo que queda en el registro), y el cambio se
-- aplica solo con el código de operaciones o gerencia. La versión que el
-- cliente tiene hoy queda archivada ENTERA en `informes_cierre_versiones`
-- antes de reescribir nada: se puede ver qué decía y quién lo cambió.
--
-- QUÉ NO SE CORRIGE POR ACÁ, y a propósito:
--   · la serie, el número, la fecha del documento y el cliente (cuenta_id):
--     eso es la identidad del informe; si está mal, se anula (0113);
--   · el estado: emitido sigue emitido, anulado no se toca;
--   · los adjuntos: tienen su propia puerta (0142).
--
-- EL IMPORTE. `monto_total` no se recibe: se recalcula de los equipos
-- (cantidad × precio, con IGV), igual que al emitir. Y como la venta toma su
-- importe del informe (0148), si el informe ya está atado a su venta y el
-- importe cambió, la venta se corrige también y se anota en sus notas.
--
-- ⚠️ El candado se parcha SOBRE LA DEFINICIÓN VIVA (pg_get_functiondef), no
-- copiando el cuerpo de la 0113: copiar cuerpos revivió reglas revertidas
-- tres veces en este repo (docs/19 §7).
-- ============================================================

-- ── 1. Lo que el informe recuerda de sus correcciones ─────────────────
alter table informes_cierre
  add column if not exists version       integer     not null default 1,
  add column if not exists corregido_at  timestamptz,
  add column if not exists corregido_por uuid references perfiles (id);

comment on column informes_cierre.version is
  'Cuántas veces salió este documento: 1 al emitir, +1 por cada corrección autorizada (0153). La versión anterior vive entera en informes_cierre_versiones.';

create table if not exists informes_cierre_versiones (
  id            uuid primary key default gen_random_uuid(),
  informe_id    uuid not null references informes_cierre (id) on delete cascade,
  version       integer not null,
  datos         jsonb not null,
  motivo        text not null,
  corregido_por uuid references perfiles (id),
  autorizo      uuid references perfiles (id),
  archivada_at  timestamptz not null default now(),
  constraint uq_version_por_informe unique (informe_id, version)
);
create index if not exists ix_versiones_informe on informes_cierre_versiones (informe_id);
alter table informes_cierre_versiones enable row level security;

-- Quien ve el informe ve sus versiones (RLS del informe aplica en la subconsulta).
drop policy if exists versiones_informe_lectura on informes_cierre_versiones;
create policy versiones_informe_lectura on informes_cierre_versiones
  for select to authenticated
  using (exists (select 1 from informes_cierre i where i.id = informes_cierre_versiones.informe_id));

comment on table informes_cierre_versiones is
  'Cada corrección autorizada de un cierre emitido guarda acá el documento tal como estaba antes, con el motivo y quién autorizó (0153).';

-- ── 2. El candado aprende la llave nueva ──────────────────────────────
do $do$
declare
  v_def text;
  v_viejo text := $s$if coalesce(current_setting('app.anulando_cierre', true), '') = 'si' then$s$;
  v_nuevo text := $s$if coalesce(current_setting('app.anulando_cierre', true), '') = 'si'
     or coalesce(current_setting('app.corrigiendo_cierre', true), '') = 'si' then$s$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bloquear_edicion_informe';
  if v_def is null then raise exception 'No existe bloquear_edicion_informe'; end if;
  if position('app.corrigiendo_cierre' in v_def) > 0 then
    return; -- ya parchada
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'No se encontró la llave de anulación en bloquear_edicion_informe; revisar antes de seguir';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$do$;

-- ── 3. Corregir: archivar, reescribir, dejar dicho por qué ────────────
create or replace function corregir_informe_emitido(
  p_informe uuid,
  p_cambios jsonb,
  p_motivo  text,
  p_pin     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quien    uuid := auth.uid();
  v_rol      text;
  v_inf      informes_cierre;
  v_autorizo uuid;
  v_items    jsonb;
  v_monto    numeric;
  v_sin_igv  numeric;
  v_venta    ventas;
  v_k        text;
  v_permitidas text[] := array[
    'cliente_nombre','cliente_doc','cliente_direccion','cliente_correo',
    'referencia','asunto','presupuesto_ref','orden_compra','cliente_nuevo','urgente',
    'modalidad_pago','forma_pago','comprobante','nota_condiciones',
    'entrega_fecha','entrega_hora','entrega_lugar','entrega_direccion','nota_despacho',
    'contacto_venta','contacto_contabilidad','contacto_despacho',
    'items','incluye','gratis','garantia','nota_final'
  ];
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  select rol::text into v_rol from perfiles where id = v_quien and activo;

  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre no existe'; end if;
  if v_inf.emitido_at is null then
    raise exception 'Ese cierre es un borrador: se edita directo, sin código';
  end if;
  if v_inf.anulado_at is not null then
    raise exception 'El cierre % está anulado y no se corrige: hay que emitir uno nuevo', v_inf.codigo;
  end if;
  if v_inf.es_prueba is distinct from es_cuenta_prueba() then
    raise exception 'Ese cierre no es de esta cuenta';
  end if;
  if v_inf.creado_por <> v_quien
     and coalesce(v_rol, '') not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'Solo quien emitió el cierre (o Central) puede corregirlo';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 15 then
    raise exception 'Escriba qué está mal en el cierre (al menos 15 caracteres): es lo que queda en el registro y lo que lee quien autoriza';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'No llegó ningún cambio';
  end if;
  for v_k in select jsonb_object_keys(p_cambios) loop
    if not (v_k = any (v_permitidas)) then
      raise exception 'El campo «%» no se corrige por esta vía', v_k;
    end if;
  end loop;

  v_items := coalesce(p_cambios->'items', v_inf.items);
  if jsonb_typeof(v_items) <> 'array'
     or (select count(*) from jsonb_array_elements(v_items) e where coalesce(e->>'bloque', 'venta') <> 'gratuito') = 0 then
    raise exception 'El cierre necesita al menos un equipo con precio';
  end if;

  -- La llave la dicta operaciones (Lesly) o gerencia, como el resto (0114).
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');

  -- El documento que el cliente tiene hoy, entero, antes de tocar nada.
  insert into informes_cierre_versiones (informe_id, version, datos, motivo, corregido_por, autorizo)
  values (p_informe, v_inf.version, to_jsonb(v_inf), trim(p_motivo), v_quien, v_autorizo);

  -- El importe sale de los equipos, con IGV: nunca se recibe escrito.
  v_sin_igv := importe_informe_sin_igv(v_items);
  v_monto   := round(v_sin_igv * 1.18, 2);

  perform set_config('app.corrigiendo_cierre', 'si', true);
  perform set_config('app.expediente_autorizado', 'si', true);
  update informes_cierre set
    cliente_nombre        = coalesce(p_cambios->>'cliente_nombre', cliente_nombre),
    cliente_doc           = case when p_cambios ? 'cliente_doc' then nullif(p_cambios->>'cliente_doc', '') else cliente_doc end,
    cliente_direccion     = case when p_cambios ? 'cliente_direccion' then nullif(p_cambios->>'cliente_direccion', '') else cliente_direccion end,
    cliente_correo        = case when p_cambios ? 'cliente_correo' then nullif(p_cambios->>'cliente_correo', '') else cliente_correo end,
    referencia            = case when p_cambios ? 'referencia' then nullif(p_cambios->>'referencia', '') else referencia end,
    asunto                = coalesce(nullif(p_cambios->>'asunto', ''), asunto),
    presupuesto_ref       = case when p_cambios ? 'presupuesto_ref' then nullif(p_cambios->>'presupuesto_ref', '') else presupuesto_ref end,
    orden_compra          = case when p_cambios ? 'orden_compra' then nullif(p_cambios->>'orden_compra', '') else orden_compra end,
    cliente_nuevo         = coalesce((p_cambios->>'cliente_nuevo')::boolean, cliente_nuevo),
    urgente               = coalesce((p_cambios->>'urgente')::boolean, urgente),
    modalidad_pago        = case when p_cambios ? 'modalidad_pago'
                              then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_cambios->'modalidad_pago') x where trim(x) <> '')
                              else modalidad_pago end,
    forma_pago            = case when p_cambios ? 'forma_pago' then nullif(p_cambios->>'forma_pago', '')::forma_pago_informe else forma_pago end,
    comprobante           = case when p_cambios ? 'comprobante' then nullif(p_cambios->>'comprobante', '')::comprobante_venta else comprobante end,
    nota_condiciones      = case when p_cambios ? 'nota_condiciones' then nullif(p_cambios->>'nota_condiciones', '') else nota_condiciones end,
    entrega_fecha         = case when p_cambios ? 'entrega_fecha' then nullif(p_cambios->>'entrega_fecha', '') else entrega_fecha end,
    entrega_hora          = case when p_cambios ? 'entrega_hora' then nullif(p_cambios->>'entrega_hora', '') else entrega_hora end,
    entrega_lugar         = case when p_cambios ? 'entrega_lugar' then nullif(p_cambios->>'entrega_lugar', '') else entrega_lugar end,
    entrega_direccion     = case when p_cambios ? 'entrega_direccion' then nullif(p_cambios->>'entrega_direccion', '') else entrega_direccion end,
    nota_despacho         = case when p_cambios ? 'nota_despacho' then nullif(p_cambios->>'nota_despacho', '') else nota_despacho end,
    contacto_venta        = coalesce(p_cambios->'contacto_venta', contacto_venta),
    contacto_contabilidad = coalesce(p_cambios->'contacto_contabilidad', contacto_contabilidad),
    contacto_despacho     = coalesce(p_cambios->'contacto_despacho', contacto_despacho),
    items                 = v_items,
    incluye               = case when p_cambios ? 'incluye'
                              then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_cambios->'incluye') x where trim(x) <> '')
                              else incluye end,
    gratis                = case when p_cambios ? 'gratis' then nullif(p_cambios->>'gratis', '') else gratis end,
    garantia              = case when p_cambios ? 'garantia' then nullif(p_cambios->>'garantia', '') else garantia end,
    nota_final            = case when p_cambios ? 'nota_final' then nullif(p_cambios->>'nota_final', '') else nota_final end,
    monto_total           = v_monto,
    version               = version + 1,
    corregido_at          = now(),
    corregido_por         = v_quien
  where id = p_informe;

  -- La venta toma su importe del informe (0148): si cambió, la venta también.
  if v_inf.venta_id is not null and v_monto <> v_inf.monto_total then
    select * into v_venta from ventas where id = v_inf.venta_id;
    if found and v_venta.monto_total <> v_sin_igv then
      update ventas
         set monto_total = v_sin_igv,
             notas = concat_ws(E'\n', notas, format(
               'El informe %s se corrigió (versión %s): la venta pasa de %s %s a %s %s.',
               coalesce(v_inf.codigo, '(sin código)'), v_inf.version + 1,
               v_venta.moneda, to_char(v_venta.monto_total, 'FM999G999G990D00'),
               v_venta.moneda, to_char(v_sin_igv, 'FM999G999G990D00')))
       where id = v_venta.id;
    end if;
  end if;

  return (select to_jsonb(i) from informes_cierre i where i.id = p_informe);
end;
$fn$;

revoke all on function corregir_informe_emitido(uuid, jsonb, text, text) from public;
grant execute on function corregir_informe_emitido(uuid, jsonb, text, text) to authenticated;

comment on function corregir_informe_emitido is
  'Corrige un cierre YA EMITIDO con el código de operaciones o gerencia (0153): archiva la versión anterior entera, recalcula el importe de los equipos y, si la venta ya está atada, la corrige también. Serie, número, fecha, cliente y estado no se tocan.';
