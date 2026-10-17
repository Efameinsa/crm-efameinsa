import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarRespuestaPortal, identificarCliente } from "@/lib/portal/cliente";
import { leerPeticionPortal, noEncontrado, rechazo, soloPost, texto } from "@/lib/portal/peticion";

/**
 * MI CUENTA PREGUNTA POR EL HISTORIAL DEL CLIENTE (contrato «Experiencia del cliente», 17-10).
 *
 * Servidor a servidor, firmado con PORTAL_SECRETO (lib/portal/firma.ts).
 * Cuerpo: { email?, telefono? }. Responde el JSON del contrato o, si no hay
 * cliente, siempre el mismo 404 { ok:false }.
 *
 * El proxy (src/proxy.ts) deja pasar /api/portal sin sesión: la llave es la firma.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const leida = await leerPeticionPortal(request);
  if ("respuesta" in leida) return leida.respuesta;
  const { cuerpo } = leida;

  try {
    const admin = createAdminClient();
    const cli = await identificarCliente(admin, { email: texto(cuerpo.email), telefono: texto(cuerpo.telefono) });
    if (!cli) return noEncontrado();
    const respuesta = await armarRespuestaPortal(admin, cli);
    return NextResponse.json(respuesta, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[portal] cliente", e instanceof Error ? e.message : e);
    return rechazo(500, "No se pudo leer el historial");
  }
}

export const GET = soloPost;
export const PUT = soloPost;
export const PATCH = soloPost;
export const DELETE = soloPost;
