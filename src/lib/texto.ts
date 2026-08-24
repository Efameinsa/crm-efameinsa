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
