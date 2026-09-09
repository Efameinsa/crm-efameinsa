/**
 * El código y el nombre que propone el NOMBRE DEL ARCHIVO de la ficha.
 *
 * La tabla de arriba del Word trae marca, modelo y capacidad, pero no el
 * código ni el nombre del equipo: eso lo pone Lesly al bautizar el archivo, y
 * lo hace siempre igual —el código primero y, en el tramo siguiente, qué es—:
 *
 *   SECU75E3. SECADORA UT075-DUAL DIGITAL -GALVANIZADO-ELECTRICO-220V.docx
 *   LAVF280-LAVADORA FX 280-CONTROL X-400G-220V.docx
 *   SECADORA UT075-DUAL DIGITAL-GALVANIZADO-ELECTRICO-220V.docx   (sin código)
 *
 * LOS DOS SEPARADORES CUENTAN, el punto y el guion. La primera versión partía
 * el nombre solo por guiones, así que la forma con punto —la que usa la
 * carpeta de UNIMAC— no dejaba ningún código: el equipo entraba al catálogo
 * con `sku` vacío y llamándose «SECU75E3. SECADORA UT075». Sin código, el PDF
 * tampoco encuentra el logo del fabricante ni la vista del panel, que se
 * guardan por código (reportado por operaciones el 09-09 con esa misma ficha).
 *
 * EL CÓDIGO LLEVA UN DÍGITO. Todos los del maestro lo tienen (LAVF280, CO402A,
 * MEVA2, PRN750U) y exigirlo es lo que evita que «SECADORA UT075-DUAL…» tome
 * la palabra SECADORA por código. Lo que sale de acá es una propuesta: los dos
 * campos quedan editables y quien decide es ella.
 */
export function codigoYNombre(archivo: string): { sku: string | null; nombre: string } {
  const base = archivo.replace(/\.docx$/i, "").trim();

  // Código pegado al principio y separado con punto o guion del resto.
  const conCodigo = base.match(/^([A-Za-z]*\d[A-Za-z0-9]{0,13})\s*[.\-–—]\s*(\S.*)$/);
  if (conCodigo && conCodigo[1].length >= 3) {
    return { sku: conCodigo[1].toUpperCase(), nombre: primerTramo(conCodigo[2]) };
  }

  return { sku: null, nombre: primerTramo(base) };
}

/** Qué es el equipo: el tramo hasta el primer guion, ya sin espacios de más. */
function primerTramo(resto: string): string {
  return resto.split("-")[0].replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}
