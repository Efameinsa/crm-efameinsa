/**
 * La versión de una cotización corregida, dicha igual en todas partes.
 *
 * DECISIÓN DE GERENCIA (23-09-2026), a la pregunta «Cotización corregida:
 * ¿el PDF indica "v2"?»:
 *
 *   «Sí, cada vez que haya una corrección tiene que estar debidamente
 *    sustentada pero se tiene que dejar claro cuál es la cotización final
 *    para evaluación de futuras propuestas.»
 *
 * La corrección con código (migración 0123) conserva el número y sube
 * `cotizaciones.version`; la anterior queda entera en `cotizacion_versiones`.
 * No hace falta columna nueva: la versión ya se guarda. Lo que faltaba era
 * DECIRLA. La original es la 1 y no lleva nada —así sale el 99 % de los
 * documentos, y un «v1» en todos ellos sería ruido—; desde la primera
 * corrección el número va con su «v2», «v3»…
 */

/** «v2», o null si es la original. */
export function etiquetaVersion(version: number | null | undefined): string | null {
  const v = Number(version ?? 1);
  return Number.isFinite(v) && v >= 2 ? `v${v}` : null;
}

/** «Presu_569-26 v2»; la original, tal cual. */
export function codigoConVersion(codigo: string | null, version: number | null | undefined): string | null {
  if (!codigo) return codigo;
  const et = etiquetaVersion(version);
  return et ? `${codigo} ${et}` : codigo;
}

/** dd/mm/aaaa en hora de Lima. */
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * La línea discreta del pie del PDF.
 *
 * · Vigente corregida: «Versión 2 · corregida el 07/09/2026 · reemplaza a la
 *   versión anterior».
 * · Archivada: «Versión 1 · REEMPLAZADA por la versión 2» — que nadie la tome
 *   por la final al compararla con propuestas futuras.
 * · Original sin correcciones: nada.
 */
export function notaDeVersion(args: {
  version: number;
  /** Cuándo nació esta versión (la corrección que la produjo). */
  corregidaAt?: string | null;
  /** La versión vigente, cuando la que se imprime quedó archivada. */
  reemplazadaPor?: number | null;
}): string | null {
  const { version, corregidaAt, reemplazadaPor } = args;
  if (reemplazadaPor && reemplazadaPor > version) {
    return `Versión ${version} · REEMPLAZADA por la versión ${reemplazadaPor}`;
  }
  if (version < 2) return null;
  const cuando = corregidaAt ? ` · corregida el ${fechaCorta(corregidaAt)}` : "";
  return `Versión ${version}${cuando} · reemplaza a la versión anterior`;
}
