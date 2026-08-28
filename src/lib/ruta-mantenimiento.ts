/**
 * La ruta de mantenimiento: la campaña de Ariana, leída como campaña.
 *
 * QUÉ ES ESTE TRABAJO. No son casos que Central deriva —esos van a Hever—: es
 * **prospección sobre la base instalada**. Ariana pide los files que le habilita
 * Lesly y llama a clientes de 2024 y 2025 a los que se les vendió un equipo y
 * nunca hicieron mantenimiento. Textual, el 27-08: «tengo que llamar a todos
 * estos clientes que ya en 2024, 2025 se les ha cotizado equipos pero no han
 * hecho su mantenimiento».
 *
 * POR QUÉ NO ALCANZA EL PIPELINE. Ella misma lo dijo mirándolo: «funciona, pero
 * no está pensado para una campaña». En el Kanban sus 103 oportunidades de
 * mantenimiento quedan mezcladas con miles de históricas y ordenadas por etapa,
 * que es la pregunta equivocada. Acá la pregunta es **a quién llamo ahora**, y
 * la respuesta se ordena por lo que la contesta: hace cuánto compró sin haberse
 * hecho un mantenimiento.
 *
 * Este archivo es solo la decisión —clasificar y ordenar—, sin base de datos ni
 * pantalla, para poder probarla con los casos reales de su Excel.
 */

export interface FilaRuta {
  id: string;
  cuentaId: string | null;
  razonSocial: string;
  /** Distrito o provincia: la ruta se hace por zona cuando se sale a visitar. */
  zona: string | null;
  etapa: string;
  /** Última venta registrada de la cuenta: el «compró» de la campaña. */
  compraAt: string | null;
  /** Del parque instalado, si esa máquina ya está fichada. */
  ultimoMantenimiento: string | null;
  serie: string | null;
  equipo: string | null;
  /** Última gestión registrada sobre la oportunidad. */
  ultimaGestionAt: string | null;
  /** Lo que el cliente respondió en esa gestión. */
  ultimaNota: string | null;
  proximaAccion: string | null;
  proximaAccionAt: string | null;
  /**
   * El cliente es de la cartera de otro comercial. No cambia de dueño —regla 1
   * del proyecto y migración 0080—: lo que es de ella es la oportunidad de
   * mantenimiento. Se muestra para que sepa con quién está hablando.
   */
  carteraDe: string | null;
}

export type ColumnaRuta = "por_llamar" | "llamados" | "cotizados" | "cerrados";

export const ETIQUETA_COLUMNA: Record<ColumnaRuta, string> = {
  por_llamar: "Por llamar",
  llamados: "Llamados",
  cotizados: "Cotizados",
  cerrados: "Cerrados",
};

/**
 * En qué columna cae cada cliente.
 *
 * «Por llamar» NO es «sin gestión»: es **lo que toca ahora**. Las 103 filas que
 * vinieron de su Excel traen todas una llamada registrada y una fecha de
 * recontacto ya vencida; si «por llamar» significara «nunca llamado», la
 * pestaña con la que arranca el día saldría vacía y el trabajo real quedaría
 * escondido en «llamados». Es el mismo error que vació el Kanban en el plan 11.
 */
export function columnaDe(f: FilaRuta, hoy: string): ColumnaRuta {
  if (f.etapa === "venta" || f.etapa === "rechazada") return "cerrados";
  if (f.etapa === "cotizada") return "cotizados";
  if (!f.ultimaGestionAt) return "por_llamar";
  if (!f.proximaAccionAt || f.proximaAccionAt <= hoy) return "por_llamar";
  return "llamados";
}

/** Días enteros entre dos fechas ISO (yyyy-mm-dd o timestamp), o null. */
export function diasEntre(desde: string | null, hasta: string): number | null {
  if (!desde) return null;
  const a = new Date(desde.length <= 10 ? `${desde}T12:00:00` : desde).getTime();
  const b = new Date(`${hasta}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 864e5);
}

/**
 * Hace cuánto que esa máquina no recibe mantenimiento.
 *
 * Si nunca se le hizo uno, el reloj corre desde la compra — que es exactamente
 * el argumento de la llamada: «compró en marzo de 2024 y nunca le hicimos el
 * preventivo». Cuando no se sabe ninguna de las dos fechas devuelve null: no se
 * inventa una antigüedad para poder ordenar.
 */
export function diasSinMantenimiento(f: FilaRuta, hoy: string): number | null {
  return diasEntre(f.ultimoMantenimiento ?? f.compraAt, hoy);
}

/** Días de atraso de la próxima acción; 0 si es para hoy, null si no hay. */
export function diasDeAtraso(f: FilaRuta, hoy: string): number | null {
  if (!f.proximaAccionAt) return null;
  const d = diasEntre(f.proximaAccionAt, hoy);
  return d != null && d >= 0 ? d : null;
}

/**
 * El orden de la campaña, de arriba hacia abajo:
 *
 *   1. lo que nunca se llamó —el cliente que todavía no sabe que existimos
 *      para esto—,
 *   2. lo más atrasado respecto de lo que ella misma se prometió,
 *   3. lo que lleva más tiempo sin mantenimiento, que es la prioridad natural
 *      de la campaña y el argumento de la llamada,
 *   4. y a igualdad de todo, por nombre, para que la lista no baile entre
 *      recargas.
 *
 * Lo que no tiene fecha conocida no se hunde al fondo: va después de lo que sí
 * la tiene, pero antes que nada se pierde de vista.
 */
export function ordenarRuta(filas: FilaRuta[], hoy: string): FilaRuta[] {
  return [...filas].sort((a, b) => {
    const nuncaA = a.ultimaGestionAt ? 0 : 1;
    const nuncaB = b.ultimaGestionAt ? 0 : 1;
    if (nuncaA !== nuncaB) return nuncaB - nuncaA;

    const atrasoA = diasDeAtraso(a, hoy) ?? -1;
    const atrasoB = diasDeAtraso(b, hoy) ?? -1;
    if (atrasoA !== atrasoB) return atrasoB - atrasoA;

    const sinA = diasSinMantenimiento(a, hoy) ?? -1;
    const sinB = diasSinMantenimiento(b, hoy) ?? -1;
    if (sinA !== sinB) return sinB - sinA;

    return a.razonSocial.localeCompare(b.razonSocial, "es");
  });
}

/**
 * El texto de la columna «Últ. mantenimiento», que es el que dispara la venta.
 *
 * El «nunca» con ⚠ no es decoración: es la maniobra que Carlos describió sin
 * llamarla así —«verifico que nunca le hemos hecho el preventivo, le cotizo el
 * repuesto y también el preventivo»—. Y «no registrado» no es «nunca»: de las
 * 103 cuentas de la ruta, la mayoría no tiene su equipo fichado todavía, y
 * afirmarle a Ariana que a ese cliente nunca se le hizo un mantenimiento sería
 * inventarle un argumento que puede quedar mal en la llamada.
 */
export function textoMantenimiento(f: FilaRuta, hoy: string): { texto: string; alerta: boolean } {
  if (f.ultimoMantenimiento) {
    const dias = diasEntre(f.ultimoMantenimiento, hoy) ?? 0;
    const meses = Math.round(dias / 30);
    // El preventivo es cada 4-6 meses (manual del área, confirmado el 27-08).
    return { texto: meses <= 1 ? "este mes" : `hace ${meses} meses`, alerta: meses >= 6 };
  }
  if (f.compraAt) return { texto: "nunca", alerta: true };
  return { texto: "no registrado", alerta: false };
}
