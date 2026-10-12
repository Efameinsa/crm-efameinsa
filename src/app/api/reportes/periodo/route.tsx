import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyLima } from "@/lib/periodo";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { cargarReportePeriodo } from "@/lib/reporte-periodo";
import { ReportePeriodoPdf } from "@/lib/pdf/reporte-periodo-pdf";

/**
 * EL REPORTE POR FECHAS (buzón, Gabriela PV2, 12-10, con gerencia): «solamente
 * tiene para generar reportes del día, más no para filtrar de un día a otro
 * día, o de un mes», «una pestaña de sus presupuestos de la semana», «que se
 * verifiquen los cierres de la semana, los seguimientos realizados».
 *
 * Del día que se elija al que se elija (hasta 3 meses), con el mismo detalle
 * del reporte del día: cada seguimiento con su cliente, vía, resultado y
 * nota; cada presupuesto con su estado; cada venta cerrada; sus actividades
 * complementarias y lo que le queda pendiente. Todo de UNA persona.
 *
 * Postventa se cuenta por quien hizo el trabajo (`trabajo-propio.ts`); un
 * comercial, como en su reporte del día, por su cartera. No se guarda nada:
 * se baja cuando se quiera.
 *
 * Autoriza la ruta (el propio, o gerencia/admin/central pidiendo el de otro)
 * y después se consulta con la llave de servicio: la RLS mira al dueño del
 * cliente y escondería las gestiones hechas sobre clientes de otra cartera.
 */

const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 93;


export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const hoy = hoyLima();
  const p = (k: string) => {
    const v = url.searchParams.get(k);
    return v && RE_FECHA.test(v) ? v : null;
  };
  let desde = p("desde") ?? hoy;
  let hasta = p("hasta") ?? desde;
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  if (hasta > hoy) hasta = hoy;
  if (desde > hoy) return NextResponse.json({ error: "Esas fechas todavía no llegan" }, { status: 400 });
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5) + 1;
  if (dias > MAX_DIAS) return NextResponse.json({ error: "Elija un rango de hasta 3 meses" }, { status: 400 });

  const pedido = url.searchParams.get("comercial");
  if (pedido && pedido !== user.id) {
    const { data: yo } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
    if (!yo || !["gerencia", "admin", "central"].includes(String(yo.rol))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }
  const personaId = pedido ?? user.id;
  const datos = await cargarReportePeriodo(createAdminClient(), personaId, desde, hasta, hoy);
  if (!datos) return NextResponse.json({ error: "No encontré a esa persona" }, { status: 404 });
  const { codigo, ...props } = datos;

  const buffer = await renderToBuffer(<ReportePeriodoPdf logoBuffer={LOGO_BUFFER} {...props} />);

  const nombre = `Reporte ${codigo ?? ""} ${desde === hasta ? desde : `${desde} al ${hasta}`}.pdf`.replace(/\s+/g, " ").trim();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraArchivo(nombre),
      "Cache-Control": "no-store",
    },
  });
}

