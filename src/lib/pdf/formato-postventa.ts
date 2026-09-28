/**
 * LOS FORMATOS DE POSTVENTA (Santos, 28-09).
 *
 * Postventa no cotiza equipos: cotiza repuestos y servicios, y los manda en dos
 * formatos propios que usaba en Word —«Presu_2196-26, TOMY JIRO EIRL» para
 * repuestos y «MINERIA SINGULARIDAD» para mantenimiento—. Con el formato de
 * equipos (resumen + una hoja de ficha por ítem + «Importante» de máquinas),
 * un repuesto de 35 dólares salía con «Incluye juego de manuales de operación»
 * y una ficha técnica que no tiene. Acá vive lo que decide cuál de los dos
 * toca y los textos fijos de cada uno; el dibujo está en
 * cotizacion-postventa-pdf.tsx.
 */

export type VariantePostventa = "repuestos" | "mantenimiento";

/** Lo mínimo de un renglón para decidir el formato. */
export interface RenglonParaVariante {
  /** Segmento del producto del catálogo; null en una línea escrita a mano. */
  segmento?: string | null;
  categoria?: string | null;
  /** Nombre del producto o, en una línea a mano, lo que se escribió. */
  concepto: string;
}

/** Una línea escrita a mano que es un servicio: «Servicio de…», «Mantenimiento…», «Mano de obra…». */
const SERVICIO_ESCRITO = /^\s*(servicio|mantenimiento|mano de obra|visita t[eé]cnica|diagn[oó]stico)/i;

/** ¿El renglón es un servicio (preventivo o correctivo), no una pieza? */
export function esServicio(r: RenglonParaVariante): boolean {
  if (r.segmento) return r.segmento === "servicio";
  if (r.categoria) return r.categoria === "servicio";
  return SERVICIO_ESCRITO.test(r.concepto);
}

/** ¿Es un servicio de mantenimiento (no un flete ni un diagnóstico)? */
function esServicioDeMantenimiento(r: RenglonParaVariante): boolean {
  return esServicio(r) && /mantenimiento/i.test(r.concepto);
}

/**
 * Qué formato lleva una cotización de postventa.
 *
 *   · MANTENIMIENTO si todos los renglones son servicios, o si la mayoría
 *     (más de la mitad) son servicios de mantenimiento: es el Word de MINERIA
 *     SINGULARIDAD, con el detalle de trabajos de cada equipo.
 *   · REPUESTOS en cualquier otro caso. Admite mezclar piezas con un servicio
 *     correctivo, como el 2196-26 de TOMY JIRO: dos repuestos y la mano de
 *     obra de instalarlos siguen siendo una cotización de repuestos.
 *
 * Sin renglones, repuestos: es el formato que no promete trabajos.
 */
export function variantePostventa(renglones: RenglonParaVariante[]): VariantePostventa {
  if (renglones.length === 0) return "repuestos";
  if (renglones.every(esServicio)) return "mantenimiento";
  const deMantenimiento = renglones.filter(esServicioDeMantenimiento).length;
  return deMantenimiento * 2 > renglones.length ? "mantenimiento" : "repuestos";
}

/**
 * El concepto del renglón en varias líneas, como lo escribe postventa en Word:
 * el repuesto o servicio arriba y debajo MARCA, MODELO, CAPACIDAD y la SERIE
 * de la máquina del cliente.
 *
 * Una línea escrita a mano ya viene así (el cotizador deja escribir en
 * renglones, Ariana 18-09) y se respeta tal cual. Un producto del catálogo arma
 * sus líneas con sus datos, y lo que se haya escrito en el renglón —la serie—
 * va debajo, sin repetir lo que ya dijo el catálogo.
 */
export function lineasDelConcepto(item: {
  nombre: string;
  marca: string;
  modelo: string;
  capacidad: string | null;
  descripcionLinea?: string | null;
  deCatalogo: boolean;
}): string[] {
  const propias = (item.descripcionLinea ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!item.deCatalogo) return propias.length > 0 ? propias : [item.nombre.trim()];

  // El modelo del catálogo a veces trae su código en otra línea
  // («GIANT C MAX\n(CWG27MDCRS)»): en el renglón va seguido.
  const plano = (s: string) => s.replace(/\s+/g, " ").trim();
  const lineas = [plano(item.nombre)];
  if (item.marca && item.marca !== "—") lineas.push(`MARCA: ${plano(item.marca)}`);
  if (item.modelo && item.modelo !== "—") lineas.push(`MODELO: ${plano(item.modelo)}`);
  if (item.capacidad) lineas.push(`CAPACIDAD: ${plano(item.capacidad)}`);
  const yaDichas = new Set(lineas.map((l) => l.toUpperCase()));
  for (const l of propias) if (!yaDichas.has(l.toUpperCase())) lineas.push(l);
  return lineas;
}

/**
 * El título del detalle de trabajos de un servicio del catálogo: «ITEM I:
 * DETALLE DEL SERVICIO DE MANTENIMIENTO PREVENTIVO DE LAVADORA INDUSTRIAL…».
 * El Word dice el tipo de equipo; el catálogo lo tiene en el nombre del
 * servicio, después de «SERVICIO DE MANTENIMIENTO PREVENTIVO».
 */
export function tituloDelDetalle(nombreServicio: string): string {
  const nombre = nombreServicio.replace(/\s+/g, " ").trim().toUpperCase();
  const m = nombre.match(/^S?ERVICIO DE MANTENIMIENTO (PREVENTIVO|CORRECTIVO)\s*(?:DE|PARA)?\s*:?\s*(.+)$/);
  if (m) return `DETALLE DEL SERVICIO DE MANTENIMIENTO ${m[1]} DE ${m[2]}`;
  return `DETALLE DEL ${nombre}`;
}

/**
 * «Entrega en las instalaciones del cliente.» → «En las instalaciones del
 * cliente.». Las opciones del cotizador hablan de entregar una máquina; en un
 * servicio el renglón es «Lugar de ejecución».
 */
export function lugarDeEjecucion(entregaLugar: string | null): string | null {
  const t = entregaLugar?.trim();
  if (!t) return null;
  const sinEntrega = t.replace(/^entrega\s+/i, "");
  return sinEntrega.charAt(0).toUpperCase() + sinEntrega.slice(1);
}

/** Notas del Word de repuestos, después de la garantía (que es la de la serie). */
export const NOTAS_REPUESTOS = [
  "Solo incluye los trabajos descritos",
  "Para ejecutar la instalación de los repuestos, deberá traer el equipo a NUESTRAS INSTALACIONES EN HUACHIPA.",
  "De requerir un repuesto no considerado en la cotización será cotizado de manera adicional.",
];

/** Lo que incluye y no incluye un mantenimiento: el Word de MINERIA SINGULARIDAD. */
export const NOTAS_MANTENIMIENTO = [
  "El servicio solo incluye los trabajos descritos.",
  "Las pruebas de operatividad, vacío y con carga.",
  "Incluye mano de obra especializada y capacitada por fábrica",
  "Incluye examen médico ocupacional, Sctr Salud",
  "El mantenimiento preventivo será realizado de acuerdo al detalle de especificaciones de cada equipo.",
  "Incluye refuerzo de capacitación al personal usuario en seguridad, operación, cuidado y programación del equipo.",
  "No incluye repuestos y/o accesorios, de requerir alguno, será cotizado de manera independiente.",
  "Incluye gastos de transporte, estadía, solo mano de obra.",
];
