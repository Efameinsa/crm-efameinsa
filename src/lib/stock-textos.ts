// Los textos de «Stock y códigos» que comparten la pantalla y el PDF del
// resumen (0576). Aquí y no en lib/stock-importaciones.ts: ese archivo trae la
// librería de Excel, que no debe ir al navegador.

export type EstadoStock = "ok" | "sugerido" | "elegir" | "nuevo" | "revisar";

export const ETIQUETA_ESTADO: Record<EstadoStock, string> = {
  revisar: "Revisar",
  elegir: "Elegir entre códigos",
  nuevo: "Código nuevo",
  sugerido: "Ya existe — faltaba ponerlo",
  ok: "Código correcto",
};

/** «Revisar» dice CUÁL es el problema (Santos 21-10: «pones revisar pero no dices qué problema es»). */
export function problemaCorto(motivo: string): string {
  if (/ya está en el CRM con/.test(motivo)) return "Serie ya vendida o reservada";
  if (/tipo de equipo: Excel lavadora/.test(motivo)) return "Es lavadora con código de secadora";
  if (/tipo de equipo: Excel secadora/.test(motivo)) return "Es secadora con código de lavadora";
  if (/MODELO dice/.test(motivo)) return "Modelo y descripción no coinciden";
  const mal = motivo.match(/SÍ está, con el código (\S+?):/);
  if (mal) return `Código mal escrito (la máquina está como ${mal[1]})`;
  if (/no existe en el (CRM|catálogo)/.test(motivo)) return "Ese código no existe";
  if (/calentamiento:/.test(motivo)) return "El tipo de gas no coincide";
  if (/voltaje:/.test(motivo)) return "El voltaje no coincide";
  if (/control:/.test(motivo)) return "El control no coincide";
  if (/retirado/.test(motivo)) return "Código retirado";
  return "Revisar";
}

/** La etiqueta completa de una máquina, como la ve Lesly. */
export function etiquetaEstado(f: { estado: EstadoStock; motivo: string; codigo: string | null; codigoExcel: string | null; crear?: boolean }): string {
  if (f.estado === "revisar") return `Revisar · ${problemaCorto(f.motivo)}`;
  if (f.estado === "nuevo" && f.codigoExcel && f.codigo === f.codigoExcel) {
    return f.crear === false ? "Código retirado · se reactiva" : "Código nuevo (lo puso Lesly)";
  }
  if (f.estado === "nuevo" && f.crear === false) return "Código retirado · se reactiva";
  return ETIQUETA_ESTADO[f.estado];
}
