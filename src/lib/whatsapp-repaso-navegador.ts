// EL CHAT SE REPASA DESDE EL NAVEGADOR (26-09, diagnóstico de consumo).
// Hasta hoy la conversación abierta llamaba cada 4 s a una acción del
// servidor (mensajesDe): 900 funciones de Vercel por hora y por pestaña, cada
// una trayendo la conversación entera y volviendo a firmar todos sus
// adjuntos. Ahora el navegador le pregunta directo a la base, con la misma
// sesión y las mismas reglas de seguridad (wa_mensajes_por_conversacion):
//  · primero una consulta mínima (id y estado): alcanza para ver si llegó algo
//    o si cambió un visto;
//  · solo si hay mensajes nuevos se traen completos, y solo sus adjuntos se
//    firman; los ya firmados se conservan (la firma dura 1 h y la pantalla se
//    vuelve a pedir mucho antes).

import { createClient } from "@/lib/supabase/client";
import type { MensajeWhatsapp } from "@/lib/acciones/whatsapp-chat";

const COLUMNAS =
  "id, wamid, direccion, tipo, texto, equipo_sku, media_url_storage, estado, timestamp_meta, created_at, perfiles(nombre)";

/**
 * Devuelve la lista al día, o `null` si no cambió nada (para no volver a
 * pintar). Lanza si la consulta falla: el que llama decide.
 */
export async function repasarMensajes(conversacionId: string, actuales: MensajeWhatsapp[]): Promise<MensajeWhatsapp[] | null> {
  const supabase = createClient();
  const { data: resumen, error } = await supabase
    .from("wa_mensajes")
    .select("id, estado")
    .eq("conversacion_id", conversacionId)
    .order("created_at");
  if (error || !resumen) throw error ?? new Error("sin datos");

  const porId = new Map(actuales.map((m) => [m.id, m]));
  const nuevos = resumen.filter((r) => !porId.has(r.id)).map((r) => r.id);
  const cambioEstado = resumen.some((r) => porId.has(r.id) && porId.get(r.id)!.estado !== r.estado);
  if (!nuevos.length && !cambioEstado && resumen.length === actuales.length) return null;

  const completos = new Map<string, MensajeWhatsapp>();
  if (nuevos.length) {
    const { data, error: errorNuevos } = await supabase.from("wa_mensajes").select(COLUMNAS).in("id", nuevos);
    if (errorNuevos || !data) throw errorNuevos ?? new Error("sin datos");
    const rutas = data.map((m) => m.media_url_storage).filter((r): r is string => Boolean(r));
    const urlPorRuta = new Map<string, string>();
    if (rutas.length) {
      const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(rutas, 3600);
      for (const f of firmadas ?? []) if (f.signedUrl && f.path) urlPorRuta.set(f.path, f.signedUrl);
    }
    for (const m of data) {
      completos.set(m.id, {
        id: m.id,
        wamid: m.wamid,
        direccion: m.direccion,
        tipo: m.tipo,
        texto: m.texto,
        equipo_sku: m.equipo_sku ?? null,
        media_url: m.media_url_storage ? (urlPorRuta.get(m.media_url_storage) ?? null) : null,
        estado: m.estado,
        enviado_por_nombre: (m.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
        timestamp_meta: m.timestamp_meta,
        created_at: m.created_at,
      });
    }
  }

  return resumen
    .map((r) => completos.get(r.id) ?? (porId.has(r.id) ? { ...porId.get(r.id)!, estado: r.estado } : null))
    .filter((m): m is MensajeWhatsapp => m !== null);
}
