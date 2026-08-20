import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { ReporteDiarioPdf } from "@/lib/pdf/reporte-diario-pdf";

// PDF del cierre del día del comercial. La autorización real la hace la
// función SQL (el propio comercial o backoffice); acá solo se comprueba que
// haya sesión y se arma el documento.
//
// Se lee una sola vez al cargar el módulo, no en cada request.
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const fechaParam = url.searchParams.get("fecha");
  const fecha = fechaParam && RE_FECHA.test(fechaParam) ? fechaParam : hoyLima();
  // Sin ?comercial, cada quien baja el suyo: es el caso normal del comercial
  // que cierra su día. Gerencia puede pedir el de otro pasándolo explícito.
  const comercialId = url.searchParams.get("comercial") ?? user.id;

  const { data, error } = await supabase.rpc("reporte_diario_comercial", {
    p_comercial: comercialId,
    p_fecha: fecha,
  });
  if (error) {
    const noAutorizado = /No autorizado/i.test(error.message);
    return NextResponse.json(
      { error: noAutorizado ? "No autorizado" : "No se pudo generar el reporte" },
      { status: noAutorizado ? 403 : 500 },
    );
  }

  const r = data as unknown as Parameters<typeof ReporteDiarioPdf>[0] & { fecha: string };
  const fechaLarga = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const buffer = await renderToBuffer(
    <ReporteDiarioPdf
      logoBuffer={LOGO_BUFFER}
      fecha={fechaLarga}
      comercial={r.comercial}
      resumen={r.resumen}
      seguimientos={r.seguimientos}
      cotizaciones={r.cotizaciones}
      ventas={r.ventas}
      leads={r.leads}
      complementarias={r.complementarias}
      agenda={r.agenda}
    />,
  );

  const nombre = `Reporte ${r.comercial.codigo ?? ""} ${fecha}.pdf`.replace(/\s+/g, " ").trim();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      // inline: se abre en el visor del navegador y desde ahí se descarga o
      // se adjunta al correo, que es el flujo que describió gerencia.
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
