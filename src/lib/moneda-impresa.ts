import { netoDeBruto } from "@/lib/igv";

// EL PRECIO EN SOLES SALE TAL COMO SE ESCRIBIÓ (0366).
//
// 01-10-2026, Gabriela cotizando mantenimientos en soles (Presu_982-26):
// escribía S/ 3,950 y el papel decía S/ 3,949.98. El cotizador guarda dólares
// (0169), así que lo escrito en soles se dividía entre el cambio, se redondeaba
// a dos decimales y al imprimir se volvía a multiplicar: 3950 / 3.63 = 1088.15
// → × 3.63 = 3949.98. Ahora el renglón guarda además `precio_impreso`, el
// número tal como se escribió en soles (con IGV si el renglón va con IGV), y
// la pantalla y el PDF lo usan en vez de reconvertir. Los renglones sin ese
// dato (los de antes, o los que vienen del maestro en dólares) se siguen
// convirtiendo como siempre.

export interface RenglonEnDolares {
  cantidad: number;
  precio_unitario: number;
  precio_con_igv?: number | null;
  precio_impreso?: number | null;
}

/** El mismo renglón con sus precios en soles, listos para mostrar o imprimir. */
export function renglonEnSoles<T extends RenglonEnDolares>(r: T, tipoCambio: number): T {
  const escrito = r.precio_impreso == null ? null : Number(r.precio_impreso);
  const conIgv = r.precio_con_igv != null;
  if (escrito != null) {
    return {
      ...r,
      precio_unitario: conIgv ? netoDeBruto(escrito) : escrito,
      precio_con_igv: conIgv ? escrito : null,
    };
  }
  // Mismo redondeo que usaba el PDF: lo ya emitido no cambia ni un centavo.
  const aSoles = (usd: number) => Math.round(usd * tipoCambio * 100) / 100;
  return {
    ...r,
    precio_unitario: aSoles(Number(r.precio_unitario)),
    precio_con_igv: conIgv ? aSoles(Number(r.precio_con_igv)) : null,
  };
}
