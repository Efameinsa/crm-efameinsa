import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { rutaEnDisco } from "@/lib/llamadas-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * LEER O DESCARGAR LA TRANSCRIPCIÓN de una llamada (Santos, 19-10-2026).
 *
 * Es el `.txt` que dejó el servicio de transcripción junto al audio, con su
 * cabecera (cliente, contacto, comercial, fecha, duración, resumen). La fila se
 * pide con la sesión de la persona, así que la RLS decide quién la ve. Si el
 * archivo ya no está en el disco pero el texto sí en la base, sale de la base.
 * `?descargar=1` baja el archivo con el mismo nombre del audio.
 */
export async function GET(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { data: llamada } = await supabase.from("llamadas").select("ruta_transcripcion, ruta_audio, transcripcion").eq("id", id).maybeSingle();
  if (!llamada) return new NextResponse(null, { status: 404 });

  let texto: string | null = null;
  const destino = llamada.ruta_transcripcion ? rutaEnDisco(llamada.ruta_transcripcion) : null;
  if (destino) texto = await fs.readFile(destino, "utf8").catch(() => null);
  if (texto === null) texto = llamada.transcripcion ?? null;
  if (texto === null) return new NextResponse(null, { status: 404 });

  const base = path.basename(llamada.ruta_transcripcion ?? llamada.ruta_audio ?? `llamada-${id}`).replace(/\.[^.]+$/, "");
  const descargar = new URL(request.url).searchParams.get("descargar") === "1";
  return new NextResponse(texto, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": cabeceraArchivo(base.replace(/_transcripcion$/, "") + "_transcripcion", "txt", descargar),
      "cache-control": "private, no-store",
    },
  });
}
