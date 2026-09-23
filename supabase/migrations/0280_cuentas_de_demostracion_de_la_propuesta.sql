-- ============================================================
-- CRM EFAMEINSA · Migración 0280 · Cuentas de demostración de la propuesta
-- ============================================================
-- Santos, 23-09: gerencia aprobó el mapa nuevo de navegación y pidió
-- recorrerlo con cuentas `…_test@efameinsa.com` que muestren los datos
-- reales de cada perfil, en solo lectura, para decidir si se queda la
-- propuesta o la navegación actual.
--
-- `espejo_de` dice de qué cuenta es espejo cada una. El servidor lee con la
-- sesión de esa cuenta (src/lib/supabase/espejo.ts) y nunca escribe (proxy +
-- src/lib/solo-lectura.ts). Las cuentas de demostración van con
-- `es_prueba = true`: no cuentan en ninguna lista ni métrica y no reciben
-- avisos del circuito.
-- ============================================================

alter table public.perfiles add column if not exists espejo_de uuid references public.perfiles (id);
comment on column public.perfiles.espejo_de is
  'Cuenta de demostración de la propuesta de navegación (0280): muestra los datos de esta cuenta, en solo lectura.';
