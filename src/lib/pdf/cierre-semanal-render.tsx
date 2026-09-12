import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sabadoDe, type CierreSemanal } from "@/lib/cierre-semanal";
import { CierreSemanalPdf } from "@/lib/pdf/cierre-semanal-pdf";

// Se lee una sola vez al cargar el módulo, no en cada documento.
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));

/**
 * El PDF del cierre de la semana, como Buffer. Lo usan dos sitios: la ruta
 * que lo baja al vuelo y el cierre que lo congela (0229) — así el documento
 * guardado es exactamente el que se ve.
 */
export async function renderizarCierreSemanal(cierre: CierreSemanal, lunes: string): Promise<Buffer> {
  const enLetra = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" });
  const rango = `Del ${enLetra(lunes)} al ${enLetra(sabadoDe(lunes))} de ${lunes.slice(0, 4)}`;
  return renderToBuffer(<CierreSemanalPdf logoBuffer={LOGO_BUFFER} rango={rango} cierre={cierre} />);
}

/** Dónde vive el PDF congelado de una semana, dentro del bucket «adjuntos». */
export function rutaPdfCierreSemana(comercialId: string, lunes: string): string {
  return `cierres-semana/${comercialId}/${lunes}.pdf`;
}
