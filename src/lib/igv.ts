/**
 * LA PLATA CON Y SIN IGV, EN UN SOLO SITIO (0233).
 *
 * Reunión 14-09, audio de Carlos revisando Aprobaciones: la venta se cerró en
 * «3.600 la lavadora, 1.600 la secadora: 8.800», cifras redondas CON IGV. Para
 * meterlas al cotizador la comercial dividía a mano entre 1,18 y tipeaba el
 * neto con dos decimales: se le fue un dedo (0,92 por 0,93) y el total salió
 * 8.799. «Siempre hay esos errores de decimales cuando ya llegamos a la etapa
 * final del cierre. Mejor un check y te calcula.»
 *
 * La regla, para que TODO lo impreso cuadre entre sí:
 *   · cada renglón sigue mostrando su precio unitario SIN IGV a dos decimales;
 *   · el renglón que se negoció con IGV incluido guarda ese precio bruto y su
 *     importe bruto es exacto (cantidad × precio con IGV);
 *   · el total con IGV es la suma de los importes brutos, y el IGV es lo que
 *     falta entre el subtotal y ese total.
 * Así 2 × 3.600 + 1.600 da 8.800,00 siempre, y un documento sin ningún
 * renglón marcado da exactamente lo mismo que antes (subtotal × 1,18).
 */
export const IGV = 0.18;

export interface RenglonConIgv {
  cantidad: number;
  /** Precio unitario SIN IGV, a dos decimales (lo que siempre se imprimió). */
  precio_unitario: number;
  /** Precio unitario negociado CON IGV, cuando el renglón se marcó así. */
  precio_con_igv?: number | null;
}

export const redondear2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** El neto a dos decimales que se imprime cuando el precio se pactó con IGV. */
export function netoDeBruto(bruto: number): number {
  return redondear2(bruto / (1 + IGV));
}

/** Importe del renglón CON IGV: exacto si se pactó bruto; derivado si no. */
export function importeConIgv(r: RenglonConIgv): number {
  if (r.precio_con_igv != null && Number.isFinite(Number(r.precio_con_igv))) {
    return redondear2(r.cantidad * Number(r.precio_con_igv));
  }
  return redondear2(r.cantidad * Number(r.precio_unitario) * (1 + IGV));
}

export function totalesConIgv(renglones: RenglonConIgv[]): { subtotal: number; igv: number; total: number } {
  const subtotal = redondear2(renglones.reduce((a, r) => a + r.cantidad * Number(r.precio_unitario), 0));
  const hayBruto = renglones.some((r) => r.precio_con_igv != null);
  // Sin renglones pactados con IGV el cálculo es el de siempre, centavo por
  // centavo: las cotizaciones ya emitidas no cambian ni un decimal.
  const total = hayBruto
    ? redondear2(renglones.reduce((a, r) => a + importeConIgv(r), 0))
    : redondear2(subtotal * (1 + IGV));
  return { subtotal, igv: redondear2(total - subtotal), total };
}
