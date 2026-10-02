import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LimiteDeTasa } from "@/lib/campo-osmand";
import { registrarEvento } from "@/lib/seguridad-alertas";
import { TIPOS_DEL_CLIENTE, type TipoEvento } from "@/lib/seguridad-conducta";

/**
 * LO QUE EL NAVEGADOR O LA APP DETECTA Y AVISA (0373).
 *
 * Capturas de pantalla (la app, o la tecla Impr Pant), copiar, descargar un
 * archivo armado en el equipo, imprimir, compartir. Va con la sesión de quien
 * lo hizo: no hay llave aparte. Solo MIRA: nunca devuelve nada y nunca falla
 * de una manera que el usuario note (204 siempre que haya sesión).
 *
 * Gerencia y admin no se vigilan: se contestan 204 sin anotar.
 */

export const dynamic = "force-dynamic";

/** Por persona: un copiar-pegar frenético o un guion que repite no llena la base. */
const porPersona = new LimiteDeTasa(120, 60_000);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!porPersona.permitir(user.id)) return new NextResponse(null, { status: 429 });

  let cuerpo: { tipo?: unknown; detalle?: unknown } | null = null;
  try {
    cuerpo = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const tipo = cuerpo?.tipo as TipoEvento;
  if (!TIPOS_DEL_CLIENTE.includes(tipo)) return new NextResponse(null, { status: 400 });

  const agente = request.headers.get("user-agent") ?? "";
  // El origen lo dice el servidor (la app se anuncia en el User-Agent o en su cookie), no el cliente.
  const origen = /EfameinsaApp\//.test(agente) || request.cookies.get("efa-app")?.value === "android" ? "app" : "web";
  await registrarEvento({ userId: user.id, tipo, origen, detalle: cuerpo?.detalle, dispositivo: agente });
  return new NextResponse(null, { status: 204 });
}
