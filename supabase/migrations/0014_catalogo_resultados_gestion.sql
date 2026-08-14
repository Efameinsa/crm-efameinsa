-- ============================================================
-- CRM EFAMEINSA · Migración 0014 · Catálogo de resultados de gestión (B8.1)
-- ============================================================
-- Feedback de gerencia tras probar B7 (docs/08): el Excel que usaban antes
-- registraba en cada gestión un código de resultado corto ('C3_Esperar',
-- 'C4_VENTA'...) — responde "¿en qué quedamos?" sin leer la nota completa.
-- Catálogo editable (NO enum): gerencia todavía no entrega su lista real de
-- códigos, así que debe poder crecer/corregirse sin nueva migración —mismo
-- patrón que catalogo_motivos_rechazo.

create table catalogo_resultados_gestion (
  id     serial primary key,
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true
);

alter table actividades add column resultado_id integer references catalogo_resultados_gestion (id);

insert into catalogo_resultados_gestion (codigo, nombre) values
  ('ESPERAR', 'Esperar'),
  ('POR_CONFIRMAR', 'Por confirmar'),
  ('COTIZADO', 'Cotizado'),
  ('FUTURO', 'Compra a futuro'),
  ('VENTA', 'Venta'),
  ('SIN_INTERES', 'Sin interés')
on conflict (codigo) do nothing;

alter table catalogo_resultados_gestion enable row level security;

create policy resultados_gestion_select on catalogo_resultados_gestion for select to authenticated using (true);
create policy resultados_gestion_write on catalogo_resultados_gestion for all to authenticated
  using (es_backoffice()) with check (es_backoffice());
