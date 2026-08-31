-- ============================================================
-- CRM EFAMEINSA · Migración 0135 · El CRM sabe qué carpeta del servidor es de cada cliente
-- ============================================================
-- Plan 24 (docs/24-vistas-documentos-del-servidor.md), fase 1. Los informes,
-- fotos y videos viven en el servidor de la oficina, organizados por carpeta
-- de cliente. Vercel no puede ver esa red, así que las sugerencias de «¿esta
-- carpeta es de este cliente?» no pueden listarse en vivo: se listan de un
-- ÍNDICE que llena scripts/indexar-carpetas-servidor.mjs desde una máquina de
-- la oficina. Solo nombres de carpeta — nunca archivos, nunca contenido.

create table if not exists carpetas_servidor (
  ruta            text primary key,   -- p. ej. X:\S. PRIVADO\COINREFRI
  nombre          text not null,      -- COINREFRI
  clase           text not null check (clase in ('informes','fotos','videos','fichas')),
  actualizado_at  timestamptz not null default now()
);

comment on table carpetas_servidor is
  'Índice de carpetas de cliente del servidor de la oficina (solo nombres). Lo llena el indexador; sirve para sugerir el vínculo cliente↔carpeta (migración 0135, plan 24).';

-- Lectura para cualquier usuario del CRM (es solo un índice de nombres);
-- escritura únicamente del indexador (service_role no pasa por políticas).
alter table carpetas_servidor enable row level security;
drop policy if exists carpetas_lectura on carpetas_servidor;
create policy carpetas_lectura on carpetas_servidor for select to authenticated using (true);

-- El vínculo vive en la cuenta: { "informes": "X:\\S. PRIVADO\\COINREFRI",
-- "fotos": "W:\\FOTOS\\PRIVADO\\COINREFRI" }. Lo escribe cualquier usuario que
-- ya pueda ver la ficha (las políticas de `cuentas` mandan) y es reversible.
alter table cuentas add column if not exists carpetas_servidor jsonb;

comment on column cuentas.carpetas_servidor is
  'Carpetas del servidor de la oficina vinculadas a este cliente, por clase (informes/fotos). Migración 0135, plan 24.';
