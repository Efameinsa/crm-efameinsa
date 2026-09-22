import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { fechaHoraLima } from "@/lib/fechas";
import { cargarHojaApertura } from "@/lib/acciones/apertura-servicio-datos";
import { AperturaServicioPdf } from "@/lib/pdf/apertura-servicio-pdf";

// El PDF descargable de la apertura de servicio (ítem 8, 22-09): mismo dato
// que ya arma `cargarHojaApertura` para la pantalla — un solo lugar donde se
// arma el documento, dos maquetaciones (HTML para leer en el navegador, PDF
// para guardar y adjuntar).
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const hoja = await cargarHojaApertura(supabase, id, perfil);
  if (!hoja) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  const buffer = await renderToBuffer(
    <AperturaServicioPdf
      logoBuffer={LOGO_BUFFER}
      empresaLarga={hoja.empresaLarga}
      emitida={hoja.servicio.apertura_despacho_at ? fechaHoraLima(hoja.servicio.apertura_despacho_at) : null}
      emitidoPor={hoja.emitidoPor}
      informeCodigo={hoja.informe?.codigo ?? null}
      ordenCompra={hoja.informe?.orden_compra ?? null}
      numeroPedidoErp={hoja.servicio.numero_pedido_erp ?? null}
      filas={hoja.filas}
      condiciones={hoja.condiciones}
      avisoPreinstalacion={hoja.avisoPreinstalacion}
      observaciones={hoja.servicio.observaciones ?? null}
    />,
  );

  const nombre = `Apertura ${hoja.d.cliente}`.slice(0, 120);
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraArchivo(nombre),
      "Cache-Control": "no-store",
    },
  });
}
