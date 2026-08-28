/**
 * Tokeniza nombre/razón social para el pre-filtro de derivación
 * (buscarCoincidencias en lib/acciones/leads.ts): quita tildes, corta en
 * espacios, descarta tokens de menos de 3 letras (ruido: "de", "SA") y se
 * queda con los primeros 4 — cada token se usa luego como un `ilike %t%`
 * independiente contra razón social o nombre de contacto.
 */
export function tokenizarBusqueda(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 4);
}

/**
 * Pasa un nombre de MAYÚSCULAS a "Primera letra en mayúscula".
 *
 * 13.371 de los 13.570 contactos vienen del histórico escritos enteros en
 * mayúsculas, y ese nombre es el que sale impreso en la cotización como
 * "Atención: JUAN PEREZ GONZALES". Darwin, 24-08: «esa información es lo que
 * se va a jalar a la cotización».
 *
 * Las partículas van en minúscula, como se escriben en castellano ("María de
 * los Ángeles"), salvo si abren el nombre. Lo que ya viene en mayúsculas y
 * minúsculas mezcladas no se toca: es alguien que ya lo escribió a propósito
 * ("McDonald", "LG Perú"). Las siglas cortas se respetan ("JR", "SAC").
 */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "do", "van", "von"]);

export function nombrePropio(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  if (!limpio) return limpio;
  // Ya tiene minúsculas: alguien lo escribió como quería.
  if (limpio !== limpio.toUpperCase()) return limpio;

  return limpio
    .toLowerCase()
    .split(" ")
    .map((palabra, i) => {
      if (i > 0 && PARTICULAS.has(palabra)) return palabra;
      // Respeta guiones y apóstrofos internos: "jean-pierre", "d'angelo".
      return palabra.replace(/(^|[-'’.])([a-záéíóúñü])/g, (_, sep, letra) => sep + letra.toUpperCase());
    })
    .join(" ");
}

/**
 * Un párrafo escrito TODO EN MAYÚSCULAS —o todo en minúsculas— puesto en
 * castellano legible.
 *
 * Carlos, 28-08, mirando los seguimientos: «siguen registrando… todo el tipo
 * de… visualmente se ve bien complicado; creo que lo vi en postventa, que
 * escriben todo en mayúscula». Y en la misma frase el reparo que ordena esta
 * función: «pero eso podría dar un error de marcas».
 *
 * Por eso NO se toca el dato: esto se aplica al mostrar. Y por eso hay dos
 * salvaguardas antes de bajar nada a minúscula:
 *
 *   · Si el texto ya mezcla mayúsculas y minúsculas, se devuelve tal cual —
 *     quien escribió así lo escribió a propósito.
 *   · Las marcas, las siglas y todo lo que lleva un dígito se quedan como
 *     están: «LG», «GMP», «SAC», «IGV», «RX280», «220V», «UT075». Poner
 *     «Lg titan max 17kg» sería cambiar el nombre del equipo, que es peor que
 *     el problema que se quiere arreglar.
 */
const INTOCABLES = new Set([
  // Marcas y fabricantes con los que trabaja la casa.
  "LG", "GMP", "UNIMAC", "PRIMUS", "EFAMEIN", "EFAMEINSA", "OPEN", "SIDI", "MONDIAL", "ADC", "SAILSTAR",
  "IPSO", "ELECTROLUX", "SPEED", "QUEEN", "MIELE", "GIRBAU", "HUEBSCH", "MAYTAG", "WHIRLPOOL", "SAMSUNG",
  // Formas societarias y documentos.
  "SAC", "S.A.C.", "SA", "S.A.", "SRL", "S.R.L.", "EIRL", "E.I.R.L.", "SAA", "EPS", "RUC", "DNI", "CE",
  // Vocabulario del negocio que se lee mejor en sigla.
  "IGV", "OC", "PDF", "CRM", "ERP", "OPL", "GLP", "GNC", "GN", "KG", "HP", "BHP", "HZ", "PH", "V", "W", "KW",
  "PVC", "INOX", "N", "N°", "NRO", "TM", "USD", "PEN", "IP", "USB", "WA", "OK",
]);

export function textoLegible(texto: string | null | undefined): string {
  const limpio = (texto ?? "").trim();
  if (!limpio) return "";
  // Ya está escrito en mixto: no se toca.
  if (limpio !== limpio.toUpperCase() && limpio !== limpio.toLowerCase()) return limpio;

  const suavizado = limpio
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return token;
      const desnudo = token.replace(/[^\p{L}\p{N}.°]/gu, "");
      // Un dígito adentro casi siempre es un modelo o una medida: RX280, 220V,
      // 17KG, UT075. Bajarlo a minúscula lo vuelve otro equipo.
      if (/\d/.test(desnudo)) return token;
      if (INTOCABLES.has(desnudo.toUpperCase())) return token.toUpperCase();
      return token.toLowerCase();
    })
    .join("");

  // Mayúscula al empezar y después de punto, signo de cierre o salto de línea.
  return suavizado.replace(/(^|[.!?¡¿:;\n]\s*)(\p{Ll})/gu, (_, antes, letra) => antes + letra.toUpperCase());
}
