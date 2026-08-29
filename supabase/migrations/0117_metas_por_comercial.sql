-- ============================================================
-- CRM EFAMEINSA · Migración 0117 · La meta deja de ser una sola para todos
-- ============================================================
-- Pedido de Darwin, 28-08, mirando la barra de la semana: «vamos a ponerle a
-- todos una meta de 30 gestiones diarias a excepción de Katerine, que ella son
-- 35, y hagamos un ratio aceptable y pertinente».
--
-- Hasta hoy la meta de gestiones era UNA sola en `parametros`
-- (`meta_seguimientos_diarios`), igual para los seis. Alguien la había subido a
-- 35 a mano en la base —el código y docs/08 siguen diciendo 30—, así que todos
-- estaban siendo calificados contra la meta de la más rápida. Ahora la meta
-- vive en el perfil de cada uno y el parámetro global queda como respaldo para
-- quien no tenga la suya.
--
-- LA META DE COTIZACIONES ES NUEVA, y sale del embudo real de 2026, no de una
-- corazonada (los ratios están medidos sobre 1.788 cotizaciones y 161 ventas
-- del año):
--
--     5 gestiones efectivas  →  1 cotización     (Brenda 4,2 · Katerine 6,3)
--    10 cotizaciones         →  1 venta          (equipo 11,1 · ticket US$ 8.714)
--
-- Con 30 gestiones al día, la semana da: 180 gestiones → 36 cotizaciones →
-- 3,6 ventas → US$ 31.400, contra una meta semanal de US$ 28.846 (125.000 ÷
-- 4,33). El embudo cierra con la meta de dinero, que es lo único que importa
-- que cierre. Con 35 (Katerine): 210 → 42 → 4,2 ventas.
--
-- ⚠️ ESTOS NÚMEROS ESPERAN EL VISTO BUENO DE GERENCIA (Darwin lo confirma el
-- 29-08). Cambiarlos después NO es un despliegue: es un update a estas dos
-- columnas. Por eso son columnas y no constantes en el código.

-- ------------------------------------------------------------
-- 1. Las dos metas, en el perfil
-- ------------------------------------------------------------
alter table perfiles add column if not exists meta_gestiones_diarias integer;
alter table perfiles add column if not exists meta_cotizaciones_semanal integer;

comment on column perfiles.meta_gestiones_diarias is
  'Seguimientos efectivos por día. NULL = usa parametros.meta_seguimientos_diarios.';
comment on column perfiles.meta_cotizaciones_semanal is
  'Cotizaciones enviadas por semana. NULL = se compara contra su propio promedio.';

-- ------------------------------------------------------------
-- 2. Los valores que pidió Darwin
-- ------------------------------------------------------------
-- Postventa queda fuera a propósito: un caso de garantía no es una gestión de
-- venta y ya estaba excluido de la meta (migraciones 0075 y 0078).
update perfiles
   set meta_gestiones_diarias = 30,
       meta_cotizaciones_semanal = 36
 where rol = 'comercial' and activo and not coalesce(es_postventa, false) and not coalesce(es_prueba, false);

update perfiles
   set meta_gestiones_diarias = 35,
       meta_cotizaciones_semanal = 42
 where codigo_comercial = 'C5';

-- ------------------------------------------------------------
-- 3. La supervisión diaria califica contra la meta de cada uno
-- ------------------------------------------------------------
-- Si no se toca, la barra del comercial diría «86 de 180» y la pantalla de
-- gerencia lo seguiría midiendo contra 35 al día: dos verdades sobre la misma
-- persona el mismo día.
--
-- Se parcha la definición VIVA en vez de copiar la función entera, igual que
-- las migraciones 0072, 0075, 0078 y 0093: `supervision_diaria` ya se redefinió
-- media docena de veces y copiar 150 líneas es la forma segura de perder algo
-- por el camino. Si el texto esperado no está, esto revienta — una corrección
-- que falla en silencio es peor que no hacerla.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'supervision_diaria' limit 1;
  if v_def is null then raise exception 'No existe supervision_diaria'; end if;

  v_nuevo := replace(
    v_def,
    '''cumple_meta'', coalesce(a.efectivos, 0) >= v_meta,',
    '''cumple_meta'', coalesce(a.efectivos, 0) >= coalesce(p.meta_gestiones_diarias, v_meta),
           ''meta_gestiones'', coalesce(p.meta_gestiones_diarias, v_meta),'
  );
  if v_nuevo = v_def then raise exception 'No se encontró cumple_meta en supervision_diaria'; end if;

  execute v_nuevo;
end $$;
