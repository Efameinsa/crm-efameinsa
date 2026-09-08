import { IGV } from "@/lib/pdf/series";

/**
 * LA CIFRA DE UNA COTIZACIÓN, UNA SOLA.
 *
 * QUÉ PASABA. `cotizaciones.total` guarda la suma de los ítems SIN IGV
 * —comprobado sobre las cotizaciones reales: el factor contra la suma de sus
 * ítems es 1,0000 en todas—, pero el cotizador muestra «Total con IGV». La
 * misma cotización decía «US$ 531.00» en el cotizador y «USD 450» en la
 * tarjeta de la ficha del cliente, y ninguna de las dos aclaraba cuál era.
 * Lo encontró el informe de UX del 08-09.
 *
 * POR QUÉ CON IGV Y NO SIN. Es la cifra que el cliente ve en el PDF y por la
 * que negocia. Un comercial que mira la lista y dice «le cotizamos 450»
 * cuando el documento dice 531 tiene una conversación incómoda por delante.
 * El número que se muestra tiene que ser el que el cliente conoce.
 *
 * NO SE TOCA LO GUARDADO. La columna sigue siendo sin IGV: cambiarla obligaría
 * a migrar y a revisar todo lo que suma cotizaciones. Lo que se unifica es lo
 * que se MUESTRA, que es donde estaba el problema.
 *
 * Ojo con el vecindario: en este esquema `monto_total` significa sin IGV en
 * `ventas` y con IGV en `informes_cierre`. Por eso acá el nombre de la función
 * dice qué devuelve, y por eso el formateador obliga a poner la etiqueta.
 */

/** De lo guardado (sin IGV) a lo que ve el cliente. */
export function totalConIgv(totalSinIgv: number | string | null | undefined): number | null {
  if (totalSinIgv == null || totalSinIgv === "") return null;
  const n = Number(totalSinIgv);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (1 + IGV) * 100) / 100;
}

/**
 * «USD 531» — la moneda, el monto con IGV y nada más. La etiqueta «con IGV»
 * va aparte y a la vista, porque un número sin etiqueta es exactamente lo que
 * produjo este problema.
 */
export function montoCotizacion(
  totalSinIgv: number | string | null | undefined,
  moneda: string | null | undefined,
): string | null {
  const conIgv = totalConIgv(totalSinIgv);
  if (conIgv == null) return null;
  return `${moneda ?? "USD"} ${conIgv.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
}
