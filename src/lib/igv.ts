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

/**
 * DESCUENTO AL FINAL DEL TOTAL (0521; Katerine 16-10, pedido de gerencia):
 * «descuento» o «descuento por paquete especial», escrito en la moneda del
 * papel, con o sin IGV, igual que el precio de un renglón.
 */
export interface DescuentoFinal {
  escrito: number;
  conIgv: boolean;
}

/** El descuento sin IGV, a dos decimales (0 si no hay). */
export function descuentoNeto(d: DescuentoFinal | null | undefined): number {
  const escrito = Number(d?.escrito ?? 0);
  if (!(escrito > 0)) return 0;
  return d!.conIgv ? netoDeBruto(escrito) : redondear2(escrito);
}

export function totalesConIgv(
  renglones: RenglonConIgv[],
  descuento?: DescuentoFinal | null,
): { subtotal: number; descuento: number; base: number; igv: number; total: number } {
  const subtotal = redondear2(renglones.reduce((a, r) => a + r.cantidad * Number(r.precio_unitario), 0));
  const hayBruto = renglones.some((r) => r.precio_con_igv != null);
  const neto = descuentoNeto(descuento);
  const base = redondear2(subtotal - neto);
  // Sin renglones pactados con IGV ni descuento con IGV el cálculo es el de
  // siempre, centavo por centavo: las cotizaciones ya emitidas no cambian ni
  // un decimal.
  const conIgvDescuento = neto > 0 && descuento!.conIgv;
  const total =
    hayBruto || conIgvDescuento
      ? redondear2(
          renglones.reduce((a, r) => a + importeConIgv(r), 0) -
            (neto > 0 ? (conIgvDescuento ? redondear2(Number(descuento!.escrito)) : redondear2(neto * (1 + IGV))) : 0),
        )
      : redondear2(base * (1 + IGV));
  return { subtotal, descuento: neto, base, igv: redondear2(total - base), total };
}

/**
 * EL DESCUENTO AL FINAL, REPARTIDO EN LOS RENGLONES (0521).
 *
 * El cierre de venta no tiene renglón de descuento: copia los renglones de la
 * cotización. Sin esto, una cotización de 24,423.64 con 423.64 de descuento
 * por paquete llegaba al cierre por 24,423.64. Cada precio baja en la misma
 * proporción y el centavo que sobre del redondeo lo absorbe un renglón de
 * cantidad 1, para que el total del cierre sea el mismo que el del PDF.
 */
export function repartirDescuento<T extends RenglonConIgv>(renglones: T[], descuento: DescuentoFinal | null | undefined): T[] {
  const objetivo = totalesConIgv(renglones, descuento);
  if (objetivo.descuento <= 0 || objetivo.subtotal <= 0) return renglones;
  const factor = objetivo.base / objetivo.subtotal;
  const repartidos = renglones.map((r) =>
    r.precio_con_igv != null
      ? { ...r, precio_con_igv: redondear2(Number(r.precio_con_igv) * factor), precio_unitario: netoDeBruto(Number(r.precio_con_igv) * factor) }
      : { ...r, precio_unitario: redondear2(Number(r.precio_unitario) * factor) },
  );
  // Lo que sobre o falte del redondeo, en un renglón de cantidad 1.
  const i = repartidos.findIndex((r) => r.cantidad === 1);
  if (i >= 0) {
    const r = repartidos[i];
    if (r.precio_con_igv != null) {
      const falta = redondear2(objetivo.total - totalesConIgv(repartidos).total);
      const bruto = redondear2(Number(r.precio_con_igv) + falta);
      repartidos[i] = { ...r, precio_con_igv: bruto, precio_unitario: netoDeBruto(bruto) };
    } else {
      const falta = redondear2(objetivo.base - totalesConIgv(repartidos).subtotal);
      repartidos[i] = { ...r, precio_unitario: redondear2(Number(r.precio_unitario) + falta) };
    }
  }
  return repartidos;
}
