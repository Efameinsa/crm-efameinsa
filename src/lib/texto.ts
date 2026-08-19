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
