// «ASÍ SE QUEDÓ» (Santos, 30-09). Katerine abrió el expediente que Central le
// derivó de PYRAMID METALS y lo vio vacío: «tenía info en mi Excel y no figura
// en el CRM». Estaba: 4 gestiones de julio en expedientes que el 02-09 pasaron
// a «Histórico», y el expediente nuevo solo muestra lo suyo. Ese día había 364
// clientes así y 1 de cada 5 derivaciones de Central cae en uno.
//
// La regla que fijó Santos: lo histórico se CONSULTA pero no ensucia el trabajo
// de hoy. Así que nada se mueve ni se reactiva, y nada de esto cuenta en «Mi
// día», la agenda ni las vencidas: el expediente nuevo solo ENSEÑA cómo se quedó
// la conversación anterior. La próxima acción que tenía el archivo se muestra
// como dato («quedó en: llamar el 22-07»), nunca como tarea vencida.
import type { EventoTimeline } from "@/components/crm/linea-tiempo-cuenta";

/** Un expediente archivado del cliente, con lo que quedó pendiente al archivarse. */
export interface ExpedienteArchivado {
  id: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
}

export interface AsiSeQuedo {
  /** La última gestión del archivo, sin el rótulo técnico del importador. */
  fecha: string;
  nota: string | null;
  quien: string | null;
  /** El estado que tenía la fila en el Excel («C3_Esperar»), si lo trae el rótulo. */
  estadoExcel: string | null;
  /** Lo que quedó pendiente: dato, no tarea. */
  quedoEn: { accion: string; fecha: string | null } | null;
  gestiones: number;
  desde: string;
  hasta: string;
}

// «[Histórico COTIZ., estado C3_Esperar] …» / «[Actualización 22-08 PROSP., estado …] …»:
// el prefijo dice cuándo se leyó el Excel, no qué se habló. Se saca del texto.
const PREFIJO_IMPORT = /^\s*\[(?:Histórico|Actualización)[^\]]*\]\s*/i;
const ESTADO_EN_PREFIJO = /estado\s+([^\]]+?)\s*\]/i;

export function sinRotuloDelImport(nota: string | null | undefined): string | null {
  if (!nota) return null;
  const limpia = nota.replace(PREFIJO_IMPORT, "").trim();
  return limpia || null;
}

export function estadoDelRotulo(nota: string | null | undefined): string | null {
  if (!nota || !PREFIJO_IMPORT.test(nota)) return null;
  const m = nota.match(ESTADO_EN_PREFIJO)?.[1]?.trim();
  return m && !/^\(?vac[ií]o\)?$/i.test(m) ? m : null;
}

/**
 * El resumen del archivo para el expediente que se está mirando, o null si el
 * cliente no tiene gestiones archivadas. Solo cuentan las GESTIONES (llamadas,
 * notas, WhatsApp…) de expedientes en «Histórico», nunca las de otro expediente
 * vivo: esos son otro caso y no se mezclan (Rubí, 28-09).
 */
export function resumirAsiSeQuedo(
  eventos: EventoTimeline[],
  archivados: ExpedienteArchivado[],
  oportunidadActualId: string,
): AsiSeQuedo | null {
  const porId = new Map(archivados.filter((a) => a.id !== oportunidadActualId).map((a) => [a.id, a]));
  if (porId.size === 0) return null;

  const gestiones = eventos
    .filter((e) => e.tipo === "actividad" && e.expediente != null && porId.has(e.expediente))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  if (gestiones.length === 0) return null;

  const ultima = gestiones[0];
  if (ultima.tipo !== "actividad") return null;

  // Qué quedó pendiente: primero lo que comprometió esa última gestión; si no
  // lo trae (las del Excel casi nunca), lo que tenía agendado su expediente.
  const expediente = porId.get(ultima.expediente!)!;
  const quedoEn = ultima.proximaAccion
    ? { accion: ultima.proximaAccion, fecha: ultima.proximaAccionAt ?? null }
    : expediente.proxima_accion
      ? { accion: expediente.proxima_accion, fecha: expediente.proxima_accion_at }
      : null;

  return {
    fecha: ultima.fecha,
    nota: sinRotuloDelImport(ultima.nota),
    quien: ultima.quien ?? null,
    estadoExcel: estadoDelRotulo(ultima.nota),
    quedoEn,
    gestiones: gestiones.length,
    desde: gestiones[gestiones.length - 1].fecha,
    hasta: ultima.fecha,
  };
}
