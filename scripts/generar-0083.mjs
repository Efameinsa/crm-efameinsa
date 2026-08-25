// Genera la migración 0083 parchando la definición VIVA de
// reporte_diario_comercial (que ya difiere de 0045 por la 0071): agrega la
// PLANIFICACIÓN DEL DÍA SIGUIENTE con detalle, pedida por el ing. Carlos en
// la reunión del 25-08 («en sus reportes también debía salir cuál es su
// planificación del día siguiente para ver cómo se están gestionando»).
import { readFileSync, writeFileSync } from "node:fs";

let def = readFileSync("scripts/data/def-reporte-diario.sql", "utf-8");

function reemplazar(ancla, nuevo) {
  if (!def.includes(ancla)) throw new Error(`ANCLA NO ENCONTRADA:\n${ancla}`);
  def = def.replace(ancla, nuevo);
}

reemplazar(
  `  v_agenda        jsonb;
  v_resumen       jsonb;`,
  `  v_agenda        jsonb;
  v_plan_gestiones jsonb;
  v_plan_tareas   jsonb;
  v_resumen       jsonb;`,
);

reemplazar(
  `  v_resumen := jsonb_build_object(`,
  `  -- 7. PLANIFICACIÓN DEL DÍA SIGUIENTE, con detalle (reunión 25-08: el
  -- número de «mañana» ya salía, pero gerencia quiere ver QUÉ hay planificado
  -- para ver cómo se están gestionando). Gestiones programadas por cliente…
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente', cu.razon_social,
           'accion', o.proxima_accion,
           'hora', to_char(o.proxima_accion_hora, 'HH24:MI'),
           'etapa', o.etapa::text
         ) order by o.proxima_accion_hora nulls last, cu.razon_social), '[]'::jsonb)
  into v_plan_gestiones
  from oportunidades o
  join cuentas cu on cu.id = o.cuenta_id
  where o.comercial_id = p_comercial
    and o.etapa not in ('venta', 'rechazada', 'derivada')
    and o.proxima_accion_at = v_fecha + 1;

  -- …y tareas propias de la agenda todavía sin completar.
  select coalesce(jsonb_agg(jsonb_build_object(
           'titulo', t.titulo, 'hora', to_char(t.hora, 'HH24:MI')
         ) order by t.hora nulls last, t.titulo), '[]'::jsonb)
  into v_plan_tareas
  from tareas_agenda t
  where t.comercial_id = p_comercial and t.fecha = v_fecha + 1 and not t.completada;

  v_resumen := jsonb_build_object(`,
);

reemplazar(
  `    'agenda', v_agenda
  );`,
  `    'agenda', v_agenda,
    'planificacion_manana', jsonb_build_object(
      'fecha', v_fecha + 1,
      'gestiones', v_plan_gestiones,
      'tareas', v_plan_tareas
    )
  );`,
);

const cabecera = `-- ============================================================
-- CRM EFAMEINSA · Migración 0083 · El reporte diario trae la planificación de mañana
-- ============================================================
-- Reunión del 25-08, ing. Carlos: «en sus reportes también debía salir cuál
-- es su planificación del día siguiente para ver cómo se están gestionando».
-- El reporte ya contaba cuántas gestiones caían mañana (un número); ahora
-- lista CUÁLES: cliente, acción anotada, hora y etapa, más las tareas propias
-- de agenda sin completar. Parchado sobre la definición viva (que ya incluye
-- el cambio de la 0071), no sobre el texto de la 0045.

`;

writeFileSync("supabase/migrations/0083_reporte_con_planificacion_del_dia_siguiente.sql", cabecera + def + ";\n");
console.log("✓ migración 0083 generada");
