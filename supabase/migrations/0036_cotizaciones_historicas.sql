-- ============================================================
-- CRM EFAMEINSA · Migración 0036 · Archivo de cotizaciones históricas
-- ============================================================
-- Las 2.644 cotizaciones que la empresa emitió antes del CRM (unidades S: y
-- T:, extraídas con scripts/parsear-cotizaciones.mjs).
--
-- POR QUÉ UNA TABLA APARTE Y NO `cotizaciones`: esa tabla tiene el trigger
-- que asigna el correlativo y el que la vuelve inmutable, y su serie ya emitió
-- los números 1-21 de las pruebas. Meter ahí 2.644 filas con correlativos
-- 100-2176 chocaría con ambos y dejaría la numeración del CRM inservible.
-- Este archivo es de solo consulta —histórico congelado, no se edita— así que
-- vive separado, igual que se hizo con las ventas del Excel.
--
-- PARA QUÉ SIRVE:
--   · el indicador que pide el ing. Carlos ("¿cuántos presupuestos registró
--     cada comercial?") deja de contar solo los que ganaron;
--   · da la tasa de conversión real: cotizaciones contra ventas;
--   · guarda el precio al que se le cotizó a cada cliente ("si le vendiste a
--     15 mil, no le cotices 10 mil").
--
-- OJO con el monto: solo está cuando la cotización IMPRIME un total (20 % en
-- Efameinsa, 58 % en Open). Muchas cotizaciones son un menú de alternativas
-- sin total cerrado; sumar los equipos daba errores de hasta 10×, así que
-- monto_sin_igv queda null y los precios por equipo se guardan en
-- precios_equipos como referencia, nunca como un total deducido.

create table if not exists cotizaciones_historicas (
  id                   uuid primary key default gen_random_uuid(),
  serie                serie_cotizacion not null,
  correlativo          integer,
  anio                 integer,
  codigo               text,                    -- "100-26" tal como lo escribe la empresa
  fecha                date,
  cliente              text not null,
  telefono             text,
  telefono_normalizado text generated always as (normalizar_telefono(telefono)) stored,
  correo               text,
  atencion             text,
  comercial_id         uuid references perfiles(id),
  asesor_codigo        text,                    -- código tal cual venía firmado (puede ser uno ya retirado, ej. C8)
  items                text[] not null default '{}',
  monto_sin_igv        numeric(12,2),
  fuente_monto         text,                    -- 'subtotal' | 'total_con_igv/1.18'
  precios_equipos      numeric(12,2)[] not null default '{}',
  n_equipos            integer,
  validez_dias         integer,
  archivo              text not null,           -- nombre base del documento, para poder volver al original
  cuenta_id            uuid references cuentas(id),
  created_at           timestamptz not null default now()
);

create unique index if not exists uq_cot_hist_archivo on cotizaciones_historicas (serie, archivo);
create index if not exists ix_cot_hist_comercial_fecha on cotizaciones_historicas (comercial_id, fecha);
create index if not exists ix_cot_hist_serie_corr on cotizaciones_historicas (serie, correlativo);
create index if not exists ix_cot_hist_cuenta on cotizaciones_historicas (cuenta_id);
create index if not exists ix_cot_hist_tel on cotizaciones_historicas (telefono_normalizado);

alter table cotizaciones_historicas enable row level security;

-- Mismo criterio que el resto del CRM: backoffice ve todo, el comercial solo
-- lo suyo. Las funciones van envueltas en (select …) — sin eso se evalúan una
-- vez POR FILA y con miles de filas la consulta se cae a segundos (lección de
-- la migración 0030).
create policy cot_hist_backoffice on cotizaciones_historicas for select to authenticated
  using ((select es_backoffice()));
create policy cot_hist_comercial on cotizaciones_historicas for select to authenticated
  using (comercial_id = (select auth.uid()));

comment on table cotizaciones_historicas is
  'Cotizaciones emitidas antes del CRM (2.644, casi todas 2026), extraídas de los documentos de S:/T:. Solo consulta: el histórico no se edita. Las nuevas van en `cotizaciones`.';
