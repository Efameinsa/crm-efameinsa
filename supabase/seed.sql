-- CRM EFAMEINSA · Seeds mínimos para el piloto
-- Los rubros reales se extraen del Excel con scripts/extraer-catalogos.mjs
-- y se pegan aquí antes de correr `supabase db reset`.

insert into catalogo_motivos_rechazo (nombre) values
  ('Compró a la competencia'),
  ('Precio fuera de presupuesto'),
  ('No responde / silencio'),
  ('Proyecto postergado'),
  ('Solo consultaba / sin intención'),
  ('Prefirió equipo usado'),
  ('Fuera de zona de cobertura'),
  ('Datos falsos / spam')
on conflict (nombre) do nothing;

-- Rubros de arranque (completar con extraer-catalogos.mjs):
insert into catalogo_rubros (nombre) values
  ('Hotel / Hospedaje'),
  ('Clínica / Salud'),
  ('Lavandería comercial'),
  ('Restaurante'),
  ('Industria textil'),
  ('Minería / Campamento'),
  ('Educación'),
  ('Otro')
on conflict (nombre) do nothing;

-- ⚠️ ANTES DEL PILOTO: fijar correlativos a los últimos valores reales
-- (último PRO de SEGUIMIENTO DE PROSPECTOS-2026.xls y últimos Presu_ de
--  L. PRESUPUESTO EFAMEINSA / L. PRESUPUESTO OPEN). Ejemplo:
-- update correlativos set ultimo = 11010 where clave = 'PRO';
-- update correlativos set ultimo = 999   where clave = 'EFAMEINSA';
-- update correlativos set ultimo = 450   where clave = 'OPEN';
