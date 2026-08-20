-- ============================================================
-- CRM EFAMEINSA · Migración 0048 · Ruta del PDF de cada cotización histórica
-- ============================================================
-- Los presupuestos de 2025 y 2026 viven como archivos en las unidades de red
-- S:, T: y O:, donde solo llega quien esté en la oficina y sepa buscarlos. Se
-- suben aligerados a un bucket privado (Cloudflare R2, fuera de Supabase para
-- no gastar el plan gratuito) y aquí queda la ruta de cada uno.
--
-- Por qué la ruta y no la URL: el bucket es privado. La URL se firma en el
-- momento, con vencimiento corto y solo si quien la pide tiene derecho a ver
-- esa cartera — la misma regla de la migración 0039. Guardar una URL fija
-- sería publicar precios y datos de clientes a quien tenga el enlace.
--
-- `pdf_bytes` sirve para saber qué se subió sin volver a preguntarle al
-- bucket, y para medir cuánto ocupa el histórico.

alter table cotizaciones_historicas
  add column if not exists pdf_path text,
  add column if not exists pdf_bytes integer;

comment on column cotizaciones_historicas.pdf_path is
  'Ruta del PDF dentro del bucket privado (serie/año/nombre). NULL = no se subió o solo existe en .doc.';
comment on column cotizaciones_historicas.pdf_bytes is
  'Tamaño del PDF subido, ya aligerado.';

-- Se consulta al abrir la ficha de un cliente, siempre filtrando por lo que
-- existe: un índice parcial es más chico y responde igual.
create index if not exists idx_cot_hist_con_pdf
  on cotizaciones_historicas (cuenta_id)
  where pdf_path is not null;
