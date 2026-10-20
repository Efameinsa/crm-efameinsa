import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { carpetaPorCliente, carpetaPorDia, nombreBase } from "@/lib/llamadas";
import {
  acceso,
  AUDIO_MAX_BYTES,
  extensionDeAudio,
  guardarAudio,
  raizLlamadas,
  rutaEnDisco,
  tipoDeExtension,
} from "@/lib/llamadas-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sinCache = { "cache-control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function responder(cuerpo: Record<string, unknown>, estado = 200) {
  return NextResponse.json(cuerpo, { status: estado, headers: sinCache });
}

/**
 * SUBIR EL AUDIO DE UNA LLAMADA (Santos, 19-10-2026).
 *
 * El celular, ya registrada la llamada (POST /api/llamadas), manda acá el archivo
 * como cuerpo binario con su `Content-Type`. Se guarda en la VM así:
 *
 *   por-dia/2026/10/2026-10-19/2026-10-19_15h42_C5-Santos_CLIENTE_987654321_3m25s.ogg
 *   por-cliente/CLIENTE_20601234567/(el mismo archivo, enlace duro)
 *
 * y la llamada queda lista para que el servicio de transcripción la tome.
 * Idempotente: si ya está subido, responde bien sin escribir de nuevo.
 */
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await contexto.params;
    if (!UUID.test(id)) return responder({ error: "datos" }, 400);
    const a = await acceso(request);
    if (!a.ok) return responder({ error: a.estado === 429 ? "demasiadas_peticiones" : "no_autenticado" }, a.estado);

    if (!raizLlamadas()) return responder({ error: "sin_almacen", detalle: "Esta copia del CRM no guarda audios: solo el servidor de la oficina." }, 503);

    const admin = createAdminClient();
    const { data: llamada } = await admin
      .from("llamadas")
      .select("id, user_id, cuenta_id, iniciada_at, duracion_s, numero, contestada, origen, estado_audio")
      .eq("id", id)
      .eq("user_id", a.quien.userId)
      .maybeSingle();
    if (!llamada) return responder({ error: "no_encontrada" }, 404);
    if (llamada.estado_audio === "subido") return responder({ ok: true, repetida: true });
    if (!llamada.contestada || llamada.origen !== "app") return responder({ error: "sin_audio", detalle: "Esta llamada no lleva audio." }, 409);

    if (Number(request.headers.get("content-length") ?? 0) > AUDIO_MAX_BYTES) return responder({ error: "muy_grande" }, 413);
    const extension = extensionDeAudio(request.headers.get("content-type"));
    if (!extension) return responder({ error: "formato", detalle: "Formato de audio no admitido." }, 415);
    const datos = new Uint8Array(await request.arrayBuffer());
    if (datos.length === 0) return responder({ error: "vacio" }, 400);
    if (datos.length > AUDIO_MAX_BYTES) return responder({ error: "muy_grande" }, 413);

    const [{ data: cuenta }, { data: perfil }] = await Promise.all([
      llamada.cuenta_id ? admin.from("cuentas").select("razon_social, nombre_comercial, num_doc").eq("id", llamada.cuenta_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("perfiles").select("nombre, codigo_comercial").eq("id", a.quien.userId).maybeSingle(),
    ]);
    const nombreCliente = cuenta?.razon_social || cuenta?.nombre_comercial || null;
    const nombre = nombreBase({
      iniciada_at: llamada.iniciada_at,
      codigoComercial: perfil?.codigo_comercial,
      nombreComercial: perfil?.nombre,
      cliente: nombreCliente,
      numero: llamada.numero,
      duracion_s: llamada.duracion_s,
    });
    const { ruta } = await guardarAudio({
      carpetaDia: carpetaPorDia(llamada.iniciada_at),
      carpetaCliente: carpetaPorCliente(nombreCliente, cuenta?.num_doc),
      nombre,
      extension,
      datos,
    });

    const { error } = await admin
      .from("llamadas")
      .update({ estado_audio: "subido", ruta_audio: ruta, audio_bytes: datos.length, estado_ia: "pendiente", intentos_ia: 0, error_ia: null })
      .eq("id", id);
    if (error) {
      console.error("llamadas/audio: no se actualizó la fila:", error.message);
      return responder({ error: "servidor" }, 500);
    }
    return responder({ ok: true, ruta });
  } catch (e) {
    console.error("llamadas/audio:", e instanceof Error ? e.message : e);
    return responder({ error: "servidor" }, 500);
  }
}

/**
 * ESCUCHAR O DESCARGAR el audio. Con la sesión de la persona: la fila se pide con
 * SU cliente de Supabase, así que la RLS decide (cada comercial ve las suyas;
 * gerencia y admin, todas). Admite `Range` para que el reproductor del navegador
 * pueda adelantar y retroceder. `?descargar=1` baja el archivo con su nombre legible.
 */
export async function GET(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { data: llamada } = await supabase.from("llamadas").select("ruta_audio, estado_audio").eq("id", id).maybeSingle();
  const destino = llamada?.ruta_audio ? rutaEnDisco(llamada.ruta_audio) : null;
  if (!llamada || !destino) return new NextResponse(null, { status: 404 });

  let contenido: Buffer;
  try {
    contenido = await fs.readFile(destino);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const extension = path.extname(destino).slice(1).toLowerCase();
  const nombreSinExtension = path.basename(destino, path.extname(destino));
  const descargar = new URL(request.url).searchParams.get("descargar") === "1";
  const cabeceras: Record<string, string> = {
    "content-type": tipoDeExtension(extension),
    "content-disposition": cabeceraArchivo(nombreSinExtension, extension, descargar),
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
  };

  const rango = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (rango && (rango[1] || rango[2])) {
    const total = contenido.length;
    let inicio = rango[1] ? Number(rango[1]) : total - Number(rango[2]);
    let fin = rango[1] && rango[2] ? Number(rango[2]) : total - 1;
    inicio = Math.max(0, inicio);
    fin = Math.min(total - 1, fin);
    if (inicio > fin) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    return new NextResponse(new Uint8Array(contenido.subarray(inicio, fin + 1)), {
      status: 206,
      headers: { ...cabeceras, "content-range": `bytes ${inicio}-${fin}/${total}`, "content-length": String(fin - inicio + 1) },
    });
  }
  return new NextResponse(new Uint8Array(contenido), { status: 200, headers: { ...cabeceras, "content-length": String(contenido.length) } });
}
