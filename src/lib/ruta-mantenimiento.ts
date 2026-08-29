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
   * Lo que se vendió, cuando el cierre ya ocurrió. Solo se usa en «Cotizados» y
   * «Cerrados»: en la cola de llamadas la cifra no ayuda a decidir a quién
   * llamar y ocupa el lugar de lo que sí —hace cuánto no se le hace el
   * mantenimiento—.
   */
  monto: number | null;
  moneda: string | null;
  cerradaAt: string | null;
  /**
   * A quién se llama y a qué número. Es una campaña de llamadas: sin el
   * teléfono en la fila, cada llamada empieza abriendo la ficha, y ahí se va el
   * presupuesto de 15 segundos de la regla 11.
   */
  contacto: string | null;
  telefono: string | null;
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
 * Cada cuántos meses toca el preventivo (manual del área, confirmado el 27-08:
 * entre 4 y 6). Pasado ese plazo la máquina está vencida y la llamada tiene
 * argumento.
 */
export const MESES_PREVENTIVO = 6;

/** Meses redondeados desde una fecha, con la misma cuenta en toda la pantalla. */
export function mesesDesde(desde: string | null, hoy: string): number | null {
  const d = diasEntre(desde, hoy);
  return d == null ? null : Math.round(d / 30);
}

/**
 * LOS TRES FILTROS DE LA CAZA (pedido de gerencia, 29-08: «debería poder
 * filtrarse también por último mantenimiento, compró, llamada, para poder
 * buscar por ahí oportunidades»).
 *
 * Las 249 filas de «Por llamar» no se trabajan de arriba abajo: se trabajan por
 * tandas —«hoy llamo a los que compraron hace más de dos años y nunca se
 * hicieron el preventivo»—. Ese recorte es el que el orden por sí solo no da,
 * porque el orden pone algo arriba pero no saca de la lista lo que hoy no toca.
 * Cada eje responde una pregunta distinta:
 *
 *   · mantenimiento → ¿tiene argumento la llamada?
 *   · compra        → ¿hace cuánto es cliente? (el equipo de 2023 está vencido
 *                     aunque nadie lo haya fichado)
 *   · llamada       → ¿ya lo trabajé o está virgen?
 */
export type EstadoMantenimiento = "nunca" | "vencido" | "al_dia" | "sin_dato";
export type EstadoCompra = "menos_1a" | "entre_1_2a" | "mas_2a" | "sin_dato";
export type EstadoLlamada = "nunca" | "hace_mas_30d" | "reciente";

// Las etiquetas van cortas a propósito: cada desplegable ya lleva su rótulo al
// lado («Mantenimiento», «Compró», «Llamada»), y con la frase entera adentro
// los tres no entraban en una fila y se apilaban.
export const ETIQUETA_MANTENIMIENTO: Record<EstadoMantenimiento, string> = {
  nunca: "nunca se le hizo",
  vencido: `vencido · ${MESES_PREVENTIVO}+ meses`,
  al_dia: "al día",
  sin_dato: "sin registro",
};

export const ETIQUETA_COMPRA: Record<EstadoCompra, string> = {
  menos_1a: "hace menos de 1 año",
  entre_1_2a: "hace 1 a 2 años",
  mas_2a: "hace más de 2 años",
  sin_dato: "sin registro",
};

export const ETIQUETA_LLAMADA: Record<EstadoLlamada, string> = {
  nunca: "nunca",
  hace_mas_30d: "hace 30 días o más",
  reciente: "en los últimos 30 días",
};

/**
 * En qué estado está el mantenimiento de esa máquina: lo que dispara la venta.
 *
 * El «nunca» no es decoración: es la maniobra que Carlos describió sin llamarla
 * así —«verifico que nunca le hemos hecho el preventivo, le cotizo el repuesto
 * y también el preventivo»—. Y «no registrado» NO es «nunca»: de las cuentas de
 * la ruta, la mayoría no tiene su equipo fichado todavía, y afirmarle a Ariana
 * que a ese cliente nunca se le hizo un mantenimiento sería inventarle un
 * argumento que puede quedar mal en la llamada.
 */
export function estadoMantenimiento(f: FilaRuta, hoy: string): EstadoMantenimiento {
  if (f.ultimoMantenimiento) {
    const meses = mesesDesde(f.ultimoMantenimiento, hoy) ?? 0;
    return meses >= MESES_PREVENTIVO ? "vencido" : "al_dia";
  }
  return f.compraAt ? "nunca" : "sin_dato";
}

/** Hace cuánto es cliente: el otro reloj de la campaña. */
export function estadoCompra(f: FilaRuta, hoy: string): EstadoCompra {
  const d = diasEntre(f.compraAt, hoy);
  if (d == null) return "sin_dato";
  if (d < 365) return "menos_1a";
  if (d < 730) return "entre_1_2a";
  return "mas_2a";
}

/** Si ya se trabajó o está virgen. 30 días es el mes de la campaña. */
export function estadoLlamada(f: FilaRuta, hoy: string): EstadoLlamada {
  if (!f.ultimaGestionAt) return "nunca";
  const d = diasEntre(f.ultimaGestionAt.slice(0, 10), hoy) ?? 0;
  return d >= 30 ? "hace_mas_30d" : "reciente";
}

export interface FiltrosRuta {
  mant?: EstadoMantenimiento | null;
  compra?: EstadoCompra | null;
  llamada?: EstadoLlamada | null;
  /** Cliente, zona, serie, equipo, contacto o teléfono. */
  q?: string | null;
}

/** Los tres ejes se cruzan con Y: cada uno recorta sobre lo que dejó el anterior. */
export function filtrarRuta(filas: FilaRuta[], hoy: string, filtros: FiltrosRuta): FilaRuta[] {
  const patron = (filtros.q ?? "").trim().toLowerCase();
  const soloDigitos = patron.replace(/\D/g, "");
  return filas.filter((f) => {
    if (filtros.mant && estadoMantenimiento(f, hoy) !== filtros.mant) return false;
    if (filtros.compra && estadoCompra(f, hoy) !== filtros.compra) return false;
    if (filtros.llamada && estadoLlamada(f, hoy) !== filtros.llamada) return false;
    if (!patron) return true;
    return (
      f.razonSocial.toLowerCase().includes(patron) ||
      (f.zona ?? "").toLowerCase().includes(patron) ||
      (f.serie ?? "").toLowerCase().includes(patron) ||
      (f.equipo ?? "").toLowerCase().includes(patron) ||
      (f.contacto ?? "").toLowerCase().includes(patron) ||
      // Se busca también por teléfono: en la campaña el cliente devuelve la
      // llamada y lo único que se tiene es el número en la pantalla.
      (soloDigitos.length >= 3 && (f.telefono ?? "").replace(/\D/g, "").includes(soloDigitos))
    );
  });
}

/**
 * Antigüedad en palabras: «hoy», «hace 6 días», «hace 14 meses», «hace 3 años».
 *
 * La fecha sola no dice nada en una campaña —12/03/2024 hay que restarlo
 * mentalmente en cada fila—; el «hace cuánto» es lo que decide si se llama.
 */
export function haceCuantoDias(dias: number | null): string {
  if (dias == null) return "—";
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 45) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  if (meses < 24) return `hace ${meses} meses`;
  return `hace ${Math.floor(dias / 365)} años`;
}
