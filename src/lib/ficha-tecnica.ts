/**
 * Las características de una ficha llegan como una sola lista de líneas, pero
 * no todas son viñetas: algunas son el TÍTULO del bloque que viene debajo
 * —TAMBOR, PUERTA, PANEL FRONTAL, SISTEMA DE TRASMISION, CALEFACCION DE
 * SECADO— tal como están en la ficha en papel.
 *
 * Impresas todas como viñetas, el PDF decía «• TAMBOR» seguido de sus tres
 * características al mismo nivel, y el cliente leía el nombre de la pieza como
 * si fuera una prestación más. Lo reportó el área comercial el 25-08 con el
 * PDF al lado del documento original.
 *
 * SE DETECTA POR FORMA, no por una lista de palabras. En las dos plantillas
 * que conviven (Alliance y LG/GMP) el título va en MAYÚSCULAS y sin punto
 * final, y las viñetas son frases normales. Una lista fija de títulos
 * conocidos habría fallado con «SISTEMA OPTIDRY», «SOAP BOARD – 8 SIGNALS»,
 * «OPTISPRAY (SPRAY RINSE)» o «CASCADE DRUM», que son títulos reales de fichas
 * de lavadoras y no se parecen entre sí.
 *
 * Comprobado contra las 65 fichas del catálogo: 129 líneas dan título en 36
 * productos, y las 1.719 restantes siguen siendo viñetas. Revisadas una por
 * una, no hay ningún falso positivo.
 */
const LIMITE_TITULO = 45;

function soloLetras(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "");
}

export function esSubtituloDeFicha(linea: string): boolean {
  const t = (linea ?? "").trim();
  // Un título es corto. Una viñeta en mayúsculas —las hay, sobre todo en las
  // fichas de Milnor— es una frase, y no cabe en este largo.
  if (!t || t.length > LIMITE_TITULO) return false;
  // Un título no termina en puntuación de frase.
  if (/[.:;,]$/.test(t)) return false;
  const letras = soloLetras(t);
  if (letras.length < 3) return false;
  return letras === letras.toUpperCase();
}

export interface LineaFicha {
  texto: string;
  esSubtitulo: boolean;
}

/** Marca cada línea de la lista para que quien la imprima sepa qué es. */
export function clasificarFicha(lineas: string[]): LineaFicha[] {
  return (lineas ?? []).map((texto) => ({ texto, esSubtitulo: esSubtituloDeFicha(texto) }));
}

/**
 * Qué tiene para mostrar la ficha de un producto.
 *
 * Existen dos formas de guardarla y hay que mirar las dos: los cuatro cajones
 * viejos (`caracteristicas`, `disenoConstruccion`, `dimensiones`, `medidas`) y
 * `bloques`, la descripción leída del Word de Lesly en su propio orden, que es
 * la única que escriben las cargas desde el 27-08. Cuando hay bloques, mandan.
 *
 * Vive acá porque el 28-08 la pantalla del cotizador miraba solo los cajones y
 * marcaba «Sin ficha técnica cargada» a los 16 equipos cargados de cero —los
 * seis coches por color entre ellos, en plena cotización— con la ficha
 * completa en la base.
 */
export function contenidoDeFicha(ficha: Record<string, unknown> | null | undefined): {
  caracteristicas: string[];
  nDimensiones: number;
  sinFicha: boolean;
} {
  const lista = (clave: string) =>
    Array.isArray(ficha?.[clave]) ? (ficha[clave] as unknown[]).filter((x): x is string => typeof x === "string") : [];

  const bloques = Array.isArray(ficha?.bloques)
    ? (ficha.bloques as unknown[]).filter(
        (b): b is { t?: string; texto: string } =>
          typeof b === "object" && b !== null && typeof (b as { texto?: unknown }).texto === "string",
      )
    : [];

  if (bloques.length > 0) {
    const caracteristicas = bloques.filter((b) => b.t !== "dato").map((b) => b.texto);
    const nDimensiones = bloques.filter((b) => b.t === "dato").length;
    return { caracteristicas, nDimensiones, sinFicha: caracteristicas.length + nDimensiones === 0 };
  }

  // Los cajones viejos, en el orden real de la ficha si lo trae.
  const ordenSecciones = Array.isArray(ficha?.ordenSecciones)
    ? (ficha.ordenSecciones as unknown[]).filter((x): x is string => typeof x === "string")
    : ["caracteristicas", "disenoConstruccion", "dimensiones", "medidas"];
  const caracteristicas = ordenSecciones
    .filter((clave) => clave === "caracteristicas" || clave === "disenoConstruccion")
    .flatMap((clave) => lista(clave));
  const nDimensiones = lista("dimensiones").length + lista("medidas").length;
  return { caracteristicas, nDimensiones, sinFicha: caracteristicas.length + nDimensiones === 0 };
}
