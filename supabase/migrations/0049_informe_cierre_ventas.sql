-- ============================================================
-- CRM EFAMEINSA · Migración 0049 · Informe de cierre de ventas
-- ============================================================
-- El documento que el comercial manda a CENTRAL cuando cierra una venta, y que
-- hoy arma a mano en Word (modelo: "INFORME OPEN Nº004-2026 - CONGELADOS Y
-- FRESCOS S.A.C."). Es la orden de trabajo interna: con esto Central factura,
-- contabilidad cobra y logística despacha.
--
-- POR QUÉ NO ALCANZA LA COTIZACIÓN: la cotización es lo que se le ofrece al
-- cliente; el informe es lo que la empresa necesita para EJECUTAR — a qué
-- dirección se despacha y con qué transportista, quién recibe, si va boleta o
-- factura, qué parte está pagada y cuál queda al crédito, y las observaciones
-- ("indicación de frágil", "atender urgente"). Nada de eso cabe en la
-- cotización ni se deduce de ella.
--
-- SE GUARDA TODO COMO TEXTO CONGELADO, no como referencias vivas: el informe es
-- un documento emitido. Si mañana el cliente cambia de dirección o el equipo de
-- precio, el informe que Central ya recibió tiene que seguir diciendo lo que
-- decía. Mismo criterio que `cotizaciones.cliente_snapshot`.

create type comprobante_venta as enum ('factura', 'boleta_ruc', 'boleta_dni');
create type forma_pago_informe as enum ('transferencia', 'deposito');

create table if not exists informes_cierre (
  id                uuid primary key default gen_random_uuid(),

  -- Numeración propia, separada por razón social y reiniciada cada año, igual
  -- que las cotizaciones (migración 0038). El modelo dice "Nº 004 - 2026".
  serie             serie_cotizacion not null,
  correlativo       integer not null default 0,
  anio              integer not null default extract(year from (now() at time zone 'America/Lima'))::integer,
  codigo            text generated always as (lpad(correlativo::text, 3, '0') || '-' || anio::text) stored,

  -- De dónde viene. Todo opcional salvo la cuenta: hoy la mayoría de las ventas
  -- se cotizan FUERA del CRM (2.130 presupuestos del archivo en 2026 contra
  -- ninguno propio), así que exigir una cotización del sistema dejaría el
  -- informe inservible justo para los casos reales.
  cuenta_id         uuid not null references cuentas(id),
  oportunidad_id    uuid references oportunidades(id),
  venta_id          uuid references ventas(id),
  cotizacion_id     uuid references cotizaciones(id),
  presupuesto_ref   text,                      -- "356-26", el Nº que va sobre la tabla de equipos

  fecha             date not null default (now() at time zone 'America/Lima')::date,
  referencia        text not null default 'Orden Superior',
  asunto            text not null,             -- razón social del cliente

  -- Cliente, congelado
  comprobante       comprobante_venta not null default 'factura',
  cliente_nuevo     boolean not null default true,
  cliente_nombre    text not null,
  cliente_doc       text,
  cliente_direccion text,
  cliente_correo    text,
  orden_compra      text,

  -- Los tres contactos del formato: quien compra, quien paga y quien recibe.
  -- jsonb y no tres tablas: son una foto del momento, no entidades vivas.
  -- {area, nombre, telefono, correo}
  contacto_venta         jsonb not null default '{}'::jsonb,
  contacto_contabilidad  jsonb not null default '{}'::jsonb,
  contacto_despacho      jsonb not null default '{}'::jsonb,

  -- Condiciones de venta. `modalidad_pago` es un arreglo porque el formato
  -- tiene casillas que se marcan JUNTAS ("50% ADELANTO" + "50% CRÉDITO").
  modalidad_pago    text[] not null default '{}',
  forma_pago        forma_pago_informe,
  moneda            moneda not null default 'USD',
  monto_total       numeric(12,2) not null,    -- con IGV: es lo que se cobra
  nota_condiciones  text,

  -- Despacho
  entrega_fecha     text,                      -- texto libre: "INMEDIATA AL PAGO DEL 50%"
  entrega_hora      text,
  entrega_lugar     text,                      -- agencia o transportista
  entrega_direccion text,                      -- destino final
  nota_despacho     text,
  urgente           boolean not null default false,

  -- Cierre del documento
  incluye           text[] not null default '{}',  -- garantía, manuales, capacitación…
  gratis            text,
  nota_final        text,

  -- Los equipos. El formato trae dos bloques: la venta y el "VENTA 2 —
  -- GRATUITO". Van en jsonb con la descripción técnica ya armada, porque el
  -- catálogo de productos con características todavía no lo entrega gerencia y
  -- hoy el comercial la escribe a mano.
  -- [{bloque:'venta'|'gratuito', descripcion, cantidad, precio_unitario}]
  items             jsonb not null default '[]'::jsonb,

  creado_por        uuid references perfiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (serie, anio, correlativo)
);

create index if not exists ix_informes_cuenta on informes_cierre (cuenta_id);
create index if not exists ix_informes_fecha on informes_cierre (fecha desc);

comment on table informes_cierre is
  'Informe de cierre de ventas que el comercial envia a Central: condiciones de pago, despacho y contactos. Documento emitido — sus textos son una foto del momento, no referencias vivas.';

-- ── Numeración ──────────────────────────────────────────────────────────────
-- PUNTO DE PARTIDA A CONFIRMAR CON GERENCIA. Del único modelo que tenemos se
-- sabe que OPEN iba por el 004 el 05/08/2026; de EFAMEINSA no hay ninguno a la
-- vista. Se arranca en 4 y en 0 para no repetir un número ya emitido, pero
-- Carlos tiene que decir en cuánto están de verdad — igual que se hizo con el
-- correlativo de las cotizaciones (2176 / 446).
insert into correlativos (clave, ultimo) values
  ('INFORME-OPEN-2026', 4),
  ('INFORME-EFAMEINSA-2026', 0)
on conflict (clave) do nothing;

create or replace function siguiente_correlativo_informe(p_serie serie_cotizacion, p_anio integer)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_clave text := 'INFORME-' || p_serie::text || '-' || p_anio::text;
  v_valor integer;
begin
  -- La clave del año nuevo se crea sola: sin esto, en enero de 2027 el informe
  -- seguiría numerando desde donde quedó 2026.
  insert into correlativos (clave, ultimo) values (v_clave, 0) on conflict (clave) do nothing;
  update correlativos set ultimo = ultimo + 1 where clave = v_clave returning ultimo into v_valor;
  return v_valor;
end;
$fn$;

create or replace function asignar_correlativo_informe()
returns trigger language plpgsql as $fn$
begin
  if new.correlativo is null or new.correlativo = 0 then
    new.anio := coalesce(new.anio, extract(year from new.fecha)::integer);
    new.correlativo := siguiente_correlativo_informe(new.serie, new.anio);
  end if;
  return new;
end;
$fn$;

create trigger trg_informe_correlativo
  before insert on informes_cierre
  for each row execute function asignar_correlativo_informe();

create trigger trg_informes_updated_at
  before update on informes_cierre
  for each row execute function set_updated_at();

-- ── Permisos ────────────────────────────────────────────────────────────────
-- El comercial trabaja sobre las cuentas de SU cartera; gerencia/admin ven
-- todo. CENTRAL además necesita LEER todos los informes aunque no sea
-- backoffice: el documento se le manda a ella, es su orden de trabajo — sin
-- esta política el destinatario del informe sería el único que no lo ve.
alter table informes_cierre enable row level security;

create policy informes_lectura on informes_cierre for select to authenticated
  using (
    (select es_backoffice())
    or (select rol_actual()) = 'central'
    or exists (select 1 from cuentas c
               where c.id = informes_cierre.cuenta_id and c.comercial_id = (select auth.uid()))
  );

create policy informes_crea on informes_cierre for insert to authenticated
  with check (
    (select es_backoffice())
    or exists (select 1 from cuentas c
               where c.id = informes_cierre.cuenta_id and c.comercial_id = (select auth.uid()))
  );

create policy informes_edita on informes_cierre for update to authenticated
  using (
    (select es_backoffice())
    or exists (select 1 from cuentas c
               where c.id = informes_cierre.cuenta_id and c.comercial_id = (select auth.uid()))
  );
