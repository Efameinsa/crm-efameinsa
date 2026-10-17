import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LiquidacionPdf } from "@/lib/pdf/liquidacion-pdf";
import type { Liquidacion } from "@/lib/liquidacion-automatica";

const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));

/** El PDF de la liquidación (0534): el mismo para la vista previa y para la validada. */
export async function pdfDeLiquidacion(l: Liquidacion, vistaPrevia: boolean): Promise<Buffer> {
  return renderToBuffer(<LiquidacionPdf l={l} logoBuffer={LOGO_BUFFER} vistaPrevia={vistaPrevia} />);
}
