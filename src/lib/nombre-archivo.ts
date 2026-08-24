/**
 * Nombres de archivo para los PDF que la gente descarga y adjunta al correo.
 *
 * Pedido del área comercial el 24-08: que el PDF de la cotización se descargue
 * como «Presu_2195-26, RAZÓN SOCIAL» — «cosa que lo que descarga ya está listo
 * para enviar por correo», sin tener que renombrarlo a mano.
 *
 * Hay dos cosas que cuidar, y las dos muerden con datos reales:
 *
 *  1. WINDOWS NO ACEPTA CUALQUIER CARÁCTER. 77 cuentas de la cartera tienen
 *     alguno de los prohibidos en su razón social — «BEAR CREEK MINING S.A.C.
 *     / MINA CORANI», «TREJO RODRIGUEZ VICTOR MANUEL - HOSTAL "LA JOYA"».
 *     Sin limpiarlos, la descarga falla o el nombre sale cortado.
 *
 *  2. LAS TILDES EN LA CABECERA HTTP. `Content-Disposition` solo admite ASCII.
 *     Un nombre con Ñ o tilde se manda por partida doble: la versión sin
 *     tildes para quien no entienda el formato nuevo, y la real codificada en
 *     UTF-8. Así nadie recibe «LUDEÃ‘A».
 */

/** Los que ningún sistema de archivos acepta: \ / : * ? " < > | */
const PROHIBIDOS = /[\\/:*?"<>|]/g;

/**
 * Deja un texto utilizable como nombre de archivo.
 *
 * Los caracteres prohibidos se cambian por un guion en vez de borrarse: en
 * «BEAR CREEK / MINA CORANI» la barra separa dos nombres, y quitarla los
 * pegaría en uno solo.
 */
export function textoParaNombreArchivo(texto: string, maximo = 90): string {
  const limpio = texto
    // Los de control no se ven pero rompen el nombre igual.
    .split("")
    .filter((c) => c.charCodeAt(0) >= 32)
    .join("")
    // El reemplazo ya viene espaciado; los guiones que YA estaban en el texto
    // no se tocan, para que "Presu_2195-26" siga siendo "Presu_2195-26".
    .replace(PROHIBIDOS, " - ")
    // Dos separadores seguidos ("*EMMA*" deja " - EMMA - ") se juntan en uno.
    .replace(/(\s-\s){2,}/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    // Windows no admite que termine en punto ni en espacio, y un separador
    // colgando al principio o al final sobra.
    .replace(/^[-.\s]+/, "")
    .replace(/[-.\s]+$/, "");
  return limpio.length > maximo ? `${limpio.slice(0, maximo).trim()}…` : limpio;
}

/**
 * Sin tildes ni eñes.
 *
 * Decisión de Darwin el 24-08: «cuando haya una letra como ñ debería salir
 * como n, para que no haya tanto problema». Es un archivo que va a viajar por
 * correo, a Windows ajenos y a carpetas compartidas, donde una eñe todavía
 * puede volverse «Ã±». Un nombre plano se abre en todas partes.
 */
function soloAscii(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split("")
    .filter((c) => {
      const n = c.charCodeAt(0);
      return n >= 32 && n <= 126 && c !== '"';
    })
    .join("");
}

/**
 * Cabecera `Content-Disposition` con el nombre bien puesto.
 *
 * `inline` a propósito: el PDF se abre en el visor del navegador y desde ahí se
 * descarga o se adjunta, que es como trabajan. El nombre es el que aparece al
 * guardar.
 */
export function cabeceraArchivo(nombreSinExtension: string, extension = "pdf"): string {
  // Si de la limpieza no queda nada, igual tiene que descargarse con ALGO: un
  // archivo llamado ".pdf" no se abre en Windows.
  const base = textoParaNombreArchivo(nombreSinExtension) || "documento";
  // Se manda SOLO la versión sin tildes. Se probó con el nombre real
  // codificado en UTF-8 (`filename*`), que es lo que recomienda el estándar,
  // pero se descartó a pedido: el archivo termina en correos, en Windows
  // ajenos y en carpetas compartidas, y ahí una eñe todavía se convierte en
  // «Ã±». Un solo nombre plano se abre igual en todas partes.
  const nombre = soloAscii(`${base}.${extension}`) || `documento.${extension}`;
  return `inline; filename="${nombre}"`;
}
