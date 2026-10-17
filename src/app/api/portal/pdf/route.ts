import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { leerTokenPdf } from "@/lib/portal/token-pdf";
import { generarPdfCotizacion, SELECT_PDF_COTIZACION, type CotizacionGuardada } from "@/lib/pdf/pdf-cotizacion-servidor";
import type { createClient } from "@/lib/supabase/server";

/**
 * EL PDF QUE ABRE EL CLIENTE DESDE MI CUENTA (17-10).
 *
 * GET /api/portal/pdf?t=<token> — el token lo emite solo la consulta firmada
 * del portal (lib/portal/token-pdf.ts) y dura una hora. Se dibuja en el
 * momento con el MISMO generador que la descarga del CRM
 * (lib/pdf/pdf-cotizacion-servidor.ts), con las cifras: es la cotización
 * que se le mandó. Borrador o anulada: no hay PDF.
 *
 * Informe de servicio e informe de cierre: todavía no. El informe de servicio
 * no tiene generador en el servidor (se imprime desde el navegador) y el de
 * cierre es un documento interno para Central (compendio de la gestión,
 * contactos de contabilidad, notas): no se le entrega al cliente.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noHay() {
  return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const token = leerTokenPdf(process.env.PORTAL_SECRETO, request.nextUrl.searchParams.get("t"));
  if (!token) return NextResponse.json({ ok: false, error: "Enlace vencido o inválido" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (token.k !== "cotizacion") return noHay();

  try {
    const admin = createAdminClient() as unknown as Awaited<ReturnType<typeof createClient>>;
    const { data: estado } = await admin.from("cotizaciones").select("estado, anulada_at, oportunidad_id").eq("id", token.id).maybeSingle();
    const e = estado as { estado: string; anulada_at: string | null; oportunidad_id: string } | null;
    if (!e || e.estado === "borrador" || e.estado === "anulada" || e.anulada_at) return noHay();

    const { data: cotizacion, error } = await admin.from("cotizaciones").select(SELECT_PDF_COTIZACION).eq("id", token.id).maybeSingle();
    if (error || !cotizacion) {
      if (error) console.error("[portal] pdf cotización", error.message);
      return noHay();
    }
    // El formato de postventa (repuestos, mantenimiento) sale igual que en el CRM.
    const { data: expediente } = await admin.from("oportunidades").select("tipo_postventa").eq("id", e.oportunidad_id).maybeSingle();
    const hecho = await generarPdfCotizacion(admin, cotizacion as unknown as CotizacionGuardada, token.id, {
      sinMontos: false,
      postventa: (expediente as { tipo_postventa: string | null } | null)?.tipo_postventa != null,
    });
    if ("error" in hecho) return noHay();

    return new NextResponse(new Uint8Array(hecho.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": cabeceraArchivo(hecho.nombre, "pdf", false),
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    console.error("[portal] pdf", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "No se pudo armar el PDF" }, { status: 500 });
  }
}
