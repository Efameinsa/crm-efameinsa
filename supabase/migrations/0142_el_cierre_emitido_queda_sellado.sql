-- ============================================================
-- CRM EFAMEINSA · Migración 0142 · El expediente del cierre emitido queda sellado
-- ============================================================
-- Pedido del ing. Carlos en la reunión del 01-09, revisando el circuito de
-- postventa con Hever:
--
--   «Una vez que se hace el cierre ya no puede agregarse más cosas en el
--    expediente. Ni el gestor, ni la central; la central lo único que puede
--    hacer es descargar, pero no agregar. […] Sí, solo sí, le va a salir una
--    alerta para que le autoricen modificar su cierre. ¿Quién lo autoriza?
--    Lesly. Pin entonces. Correcto.»
--
-- Esto REVIERTE parcialmente la 0099 (28-08), que dejaba agregar documentos
-- a un informe emitido (el caso del voucher que llega un mes después con
-- crédito a 30 días). Ese caso sigue existiendo — por eso no se bloquea a
-- secas: se agrega CON el código de operaciones (Lesly) o gerencia, que es
-- exactamente el circuito que Carlos describió: Central observa → el gestor
-- pide el código → corrige → sigue el circuito.
--
-- Dos piezas:
--   1. Un trigger: el candado vive en la BASE (lección de la 0127: la
--      pantalla protege una vez, la base protege siempre). Cambiar los
--      adjuntos de un informe emitido sin la llave de sesión truena.
--   2. El RPC `agregar_adjuntos_cierre_sellado`: valida el código con
--      `validar_codigo_autorizacion(pin, 'operaciones')` (0114 — Lesly o
--      gerencia), firma cada documento agregado con quién lo autorizó, y
--      recién ahí levanta la llave y escribe.

-- ── 1. El candado ─────────────────────────────────────────────────────
create or replace function sellar_expediente_cierre()
returns trigger language plpgsql as $$
begin
  if old.emitido_at is not null
     and new.adjuntos is distinct from old.adjuntos
     and coalesce(current_setting('app.expediente_autorizado', true), '') <> 'si' then
    raise exception 'El expediente de un cierre emitido está sellado. Para agregar un documento pida el código de autorización a operaciones o gerencia.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sellar_expediente_cierre on informes_cierre;
create trigger trg_sellar_expediente_cierre
  before update on informes_cierre
  for each row execute function sellar_expediente_cierre();

-- ── 2. Agregar con el código ──────────────────────────────────────────
create or replace function agregar_adjuntos_cierre_sellado(
  p_informe uuid,
  p_nuevos  jsonb,
  p_pin     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien    uuid := auth.uid();
  v_rol      text;
  v_inf      record;
  v_autorizo uuid;
  v_nuevos   jsonb;
  v_total    integer;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select rol::text into v_rol from perfiles where id = v_quien and activo;

  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre no existe'; end if;
  if v_inf.emitido_at is null then
    raise exception 'Ese cierre es un borrador: los documentos se agregan directo, sin código';
  end if;
  if v_inf.anulado_at is not null then
    raise exception 'El cierre % está anulado: su expediente no se toca', v_inf.codigo;
  end if;
  -- El banco de pruebas no se cruza con lo real (misma regla que anular, 0114).
  if v_inf.es_prueba is distinct from es_cuenta_prueba() then
    raise exception 'Ese cierre no es de esta cuenta';
  end if;
  -- Quien agrega es el dueño del informe, o backoffice/central/operaciones.
  if v_inf.creado_por <> v_quien
     and coalesce(v_rol, '') not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'Solo quien emitió el cierre (o Central) puede agregarle documentos';
  end if;

  if jsonb_typeof(p_nuevos) <> 'array' or jsonb_array_length(p_nuevos) = 0 then
    raise exception 'No llegó ningún documento para agregar';
  end if;

  v_total := coalesce(jsonb_array_length(v_inf.adjuntos), 0) + jsonb_array_length(p_nuevos);
  if v_total > 12 then
    raise exception 'El expediente admite hasta 12 documentos';
  end if;

  -- La llave la dicta Lesly (operaciones) o gerencia, como el resto de lo
  -- operativo (0114). Queda registrado QUIÉN autorizó, en cada documento.
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');
  select jsonb_agg(elem || jsonb_build_object('autorizado_por', v_autorizo, 'autorizado_at', now()))
    into v_nuevos
    from jsonb_array_elements(p_nuevos) elem;

  perform set_config('app.expediente_autorizado', 'si', true);
  update informes_cierre
     set adjuntos = coalesce(adjuntos, '[]'::jsonb) || v_nuevos
   where id = p_informe;

  return (select adjuntos from informes_cierre where id = p_informe);
end;
$$;

revoke all on function agregar_adjuntos_cierre_sellado(uuid, jsonb, text) from public;
grant execute on function agregar_adjuntos_cierre_sellado(uuid, jsonb, text) to authenticated;

comment on function agregar_adjuntos_cierre_sellado is
  'Agrega documentos al expediente de un cierre YA EMITIDO, con el código de operaciones o gerencia (0142). Cada documento queda firmado con quién lo autorizó.';
