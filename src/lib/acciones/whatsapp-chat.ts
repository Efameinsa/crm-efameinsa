"use server";

// Bandeja de chat de WhatsApp (fase 2, 15-09-2026). Plan completo en
// Downloads/plan-whatsapp-api-crm.md, sección 2.6 — PENDIENTE DE APROBACIÓN
// DE GERENCIA PARA USAR EN PRODUCCIÓN (falta que Meta apruebe la
// verificación del negocio; mientras tanto se prueba con el número de
// pruebas gratuito de Meta, ver Downloads/guia-verificacion-meta-whatsapp.md).
//
// La visibilidad de qué conversación ve cada quien la decide RLS
// (`wa_conversaciones_central`, `wa_conversaciones_comercial`, 0233) — este
// archivo nunca filtra por rol a mano, para que no se desalinee de la
// política real.

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { enviarTexto, enviarMedia, enviarFichaEquipo, enviarProductosCatalogo, type TipoMedia } from "@/lib/whatsapp";

// Mismo bucket privado que los adjuntos de un lead (0029): un archivo, un
// código, y una URL firmada de vida corta —acá basta con minutos, el tiempo
// que Meta tarda en ir a buscarla al mandar el mensaje—.
const SEGUNDOS_URL_ENVIO = 300;

function tipoMediaDeMime(mime: string): TipoMedia {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export interface ConversacionWhatsapp {
  id: string;
  telefono: string;
  nombre_wa: string | null;
  lead_id: string | null;
  asignado_a: string | null;
  asignado_a_nombre: string | null;
  estado: "sin_atender" | "en_gestion" | "cerrada";
  ultimo_mensaje_cliente_at: string | null;
  ultimo_mensaje_at: string | null;
  codigo_campania_wa: string | null;
  ultimo_texto: string | null;
}

export type FiltroConversaciones = "sin_atender" | "mias" | "todas" | "cerradas";

/**
 * `comercialId`: para Central/gerencia, ver los chats de UN comercial en
 * concreto en vez de la mezcla de todos (Santos, 15-09: «¿no debería haber
 * antes una vista de la lista de comerciales?»). A un comercial normal no le
 * sirve de nada mandar el id de otro — RLS (`wa_conversaciones_comercial`)
 * solo le devuelve lo suyo de todos modos, así que acá no hace falta
 * comprobar el rol a mano.
 */
export async function conversacionesDe(filtro: FiltroConversaciones, comercialId?: string): Promise<ConversacionWhatsapp[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let consulta = supabase
    .from("wa_conversaciones")
    .select("id, telefono, nombre_wa, lead_id, asignado_a, estado, ultimo_mensaje_cliente_at, ultimo_mensaje_at, codigo_campania_wa, perfiles(nombre)")
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false });

  if (filtro === "sin_atender") consulta = consulta.eq("estado", "sin_atender");
  else if (filtro === "mias") consulta = consulta.eq("asignado_a", user.id).neq("estado", "cerrada");
  else if (filtro === "cerradas") consulta = consulta.eq("estado", "cerrada");
  else consulta = consulta.neq("estado", "cerrada");

  if (comercialId) consulta = consulta.eq("asignado_a", comercialId);

  const { data } = await consulta;
  if (!data) return [];

  const conIds = data.map((c) => c.id);
  const ultimos = new Map<string, string>();
  if (conIds.length > 0) {
    const { data: mensajes } = await supabase
      .from("wa_mensajes")
      .select("conversacion_id, texto, created_at")
      .in("conversacion_id", conIds)
      .order("created_at", { ascending: false });
    for (const m of mensajes ?? []) {
      if (!ultimos.has(m.conversacion_id)) ultimos.set(m.conversacion_id, m.texto ?? "(sin texto)");
    }
  }

  return data.map((c) => ({
    id: c.id,
    telefono: c.telefono,
    nombre_wa: c.nombre_wa,
    lead_id: c.lead_id,
    asignado_a: c.asignado_a,
    asignado_a_nombre: (c.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
    estado: c.estado,
    ultimo_mensaje_cliente_at: c.ultimo_mensaje_cliente_at,
    ultimo_mensaje_at: c.ultimo_mensaje_at,
    codigo_campania_wa: c.codigo_campania_wa,
    ultimo_texto: ultimos.get(c.id) ?? null,
  }));
}

/** Para el selector "ver los chats de…" (Central/gerencia) y el de "Derivar". */
export async function comercialesActivos(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("perfiles").select("id, nombre").eq("rol", "comercial").eq("activo", true).order("nombre");
  return data ?? [];
}

export interface ConversacionDetalle extends ConversacionWhatsapp {
  lead_codigo: string | null;
  lead_nombre_contacto: string | null;
}

export async function conversacionPorId(id: string): Promise<ConversacionDetalle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_conversaciones")
    .select(
      "id, telefono, nombre_wa, lead_id, asignado_a, estado, ultimo_mensaje_cliente_at, ultimo_mensaje_at, codigo_campania_wa, perfiles(nombre), leads(codigo, nombre_contacto)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const lead = data.leads as unknown as { codigo: string; nombre_contacto: string } | null;
  return {
    id: data.id,
    telefono: data.telefono,
    nombre_wa: data.nombre_wa,
    lead_id: data.lead_id,
    asignado_a: data.asignado_a,
    asignado_a_nombre: (data.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
    estado: data.estado,
    ultimo_mensaje_cliente_at: data.ultimo_mensaje_cliente_at,
    ultimo_mensaje_at: data.ultimo_mensaje_at,
    codigo_campania_wa: data.codigo_campania_wa,
    ultimo_texto: null,
    lead_codigo: lead?.codigo ?? null,
    lead_nombre_contacto: lead?.nombre_contacto ?? null,
  };
}

export interface MensajeWhatsapp {
  id: string;
  wamid: string | null;
  direccion: "entrante" | "saliente";
  tipo: string;
  texto: string | null;
  /** Firmada al vuelo, 1 h — solo para lo que YA está en nuestro Storage (lo que nosotros mandamos; lo entrante todavía no se descarga, ver el webhook). */
  media_url: string | null;
  estado: string;
  enviado_por_nombre: string | null;
  timestamp_meta: string | null;
  created_at: string;
}

export async function mensajesDe(conversacionId: string): Promise<MensajeWhatsapp[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_mensajes")
    .select("id, wamid, direccion, tipo, texto, media_url_storage, estado, timestamp_meta, created_at, perfiles(nombre)")
    .eq("conversacion_id", conversacionId)
    .order("created_at");
  if (!data) return [];

  const rutas = data.map((m) => m.media_url_storage).filter((r): r is string => Boolean(r));
  const urlPorRuta = new Map<string, string>();
  if (rutas.length > 0) {
    const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(rutas, 3600);
    for (const f of firmadas ?? []) if (f.signedUrl && f.path) urlPorRuta.set(f.path, f.signedUrl);
  }

  return data.map((m) => ({
    id: m.id,
    wamid: m.wamid,
    direccion: m.direccion,
    tipo: m.tipo,
    texto: m.texto,
    media_url: m.media_url_storage ? (urlPorRuta.get(m.media_url_storage) ?? null) : null,
    estado: m.estado,
    enviado_por_nombre: (m.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
    timestamp_meta: m.timestamp_meta,
    created_at: m.created_at,
  }));
}

export async function enviarMensajeChat(conversacionId: string, texto: string): Promise<{ error: string | null }> {
  if (!texto.trim()) return { error: "Escriba un mensaje" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { data: conversacion } = await supabase
    .from("wa_conversaciones")
    .select("telefono, estado")
    .eq("id", conversacionId)
    .maybeSingle();
  if (!conversacion) return { error: "La conversación ya no existe" };

  const resultado = await enviarTexto(conversacionId, conversacion.telefono, texto.trim(), user.id);
  if (resultado.error) return resultado;

  // El primer mensaje que manda alguien pasa la conversación a "en gestión"
  // — deja de contar como "sin atender".
  if (conversacion.estado === "sin_atender") {
    await supabase.from("wa_conversaciones").update({ estado: "en_gestion" }).eq("id", conversacionId);
  }

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}

/**
 * Manda una imagen, documento o audio ya subido al bucket `adjuntos` (el
 * cliente lo sube directo desde el navegador, como en la captura de leads —
 * acá solo se firma la URL y se manda). `path` es la ruta dentro del bucket,
 * `nombreArchivo` el nombre original (para el filename del documento).
 */
export async function enviarAdjuntoChat(
  conversacionId: string,
  path: string,
  nombreArchivo: string,
  mime: string,
  caption?: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { data: conversacion } = await supabase
    .from("wa_conversaciones")
    .select("telefono, estado")
    .eq("id", conversacionId)
    .maybeSingle();
  if (!conversacion) return { error: "La conversación ya no existe" };

  const { data: firmada, error: errorFirma } = await supabase.storage.from("adjuntos").createSignedUrl(path, SEGUNDOS_URL_ENVIO);
  if (errorFirma || !firmada) return { error: "No se pudo preparar el archivo para enviarlo" };

  const tipo = tipoMediaDeMime(mime);
  const resultado = await enviarMedia(
    conversacionId,
    conversacion.telefono,
    { tipo, link: firmada.signedUrl, caption, filename: nombreArchivo, mediaUrlStorage: path },
    user.id,
  );
  if (resultado.error) return resultado;

  if (conversacion.estado === "sin_atender") {
    await supabase.from("wa_conversaciones").update({ estado: "en_gestion" }).eq("id", conversacionId);
  }

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}

/** Central deriva la conversación a un comercial — mismo criterio que derivar un lead. */
export async function derivarConversacion(conversacionId: string, comercialId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("wa_conversaciones")
    .update({ asignado_a: comercialId, estado: "en_gestion" })
    .eq("id", conversacionId);
  if (error) return { error: error.message };

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}

export async function cerrarConversacion(conversacionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("wa_conversaciones").update({ estado: "cerrada" }).eq("id", conversacionId);
  if (error) return { error: error.message };

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}

export async function reabrirConversacion(conversacionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("wa_conversaciones").update({ estado: "sin_atender" }).eq("id", conversacionId);
  if (error) return { error: error.message };

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}

// ------------------------------------------------------------
// Stickers de la empresa (Santos, 15-09): un catálogo que carga marketing
// una sola vez —ya convertido a lo único que WhatsApp acepta como sticker,
// WebP cuadrado de hasta 512×512 y 100 KB— para que el chat solo ELIJA uno,
// igual que los códigos de campaña.

export interface Sticker {
  id: string;
  nombre: string;
  path: string;
  activo: boolean;
  created_at: string;
}

async function urlDeSticker(supabase: Awaited<ReturnType<typeof createClient>>, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("adjuntos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Para el selector del chat: solo los activos, con su miniatura ya firmada. */
export async function stickersActivos(): Promise<(Sticker & { url: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("wa_stickers").select("id, nombre, path, activo, created_at").eq("activo", true).order("created_at");
  if (!data || data.length === 0) return [];
  return Promise.all(data.map(async (s) => ({ ...s, url: await urlDeSticker(supabase, s.path) })));
}

/** Para la pantalla de administración: todos, activos e inactivos. */
export async function listarStickers(): Promise<(Sticker & { url: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("wa_stickers").select("id, nombre, path, activo, created_at").order("created_at", { ascending: false });
  if (!data || data.length === 0) return [];
  return Promise.all(data.map(async (s) => ({ ...s, url: await urlDeSticker(supabase, s.path) })));
}

const LADO_STICKER = 512;
const PESO_MAXIMO_STICKER = 100 * 1024; // límite de Meta para stickers estáticos

/**
 * Convierte lo que sea (foto, logo, PNG con transparencia…) a lo que
 * WhatsApp exige para un sticker: WebP cuadrado de 512×512 y menos de
 * 100 KB. `fit: "contain"` sobre lienzo transparente evita recortar logos
 * que no vienen cuadrados; después se baja la calidad hasta entrar en el
 * peso — la mayoría de logos entran sin bajar de calidad 90.
 */
async function convertirASticker(buffer: Buffer): Promise<Buffer> {
  const base = sharp(buffer).resize(LADO_STICKER, LADO_STICKER, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  for (let calidad = 90; calidad >= 30; calidad -= 15) {
    const salida = await base.clone().webp({ quality: calidad, alphaQuality: 100 }).toBuffer();
    if (salida.byteLength <= PESO_MAXIMO_STICKER) return salida;
  }
  // Si ni con calidad 30 entra (imagen muy compleja), se manda esa igual:
  // sigue siendo un WebP 512×512 válido, solo que más comprimido de lo ideal.
  return base.clone().webp({ quality: 30, alphaQuality: 100 }).toBuffer();
}

export async function subirSticker(formData: FormData): Promise<{ error: string | null }> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const archivo = formData.get("archivo");
  if (!nombre) return { error: "Falta el nombre del sticker" };
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elija una imagen" };
  if (archivo.size > 10 * 1024 * 1024) return { error: "La imagen de origen pasa de 10 MB" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  let convertido: Buffer;
  try {
    const original = Buffer.from(await archivo.arrayBuffer());
    convertido = await convertirASticker(original);
  } catch {
    return { error: "No se pudo convertir la imagen a sticker — pruebe con otro archivo" };
  }

  const path = `stickers/${crypto.randomUUID()}.webp`;
  const { error: errorSubida } = await supabase.storage.from("adjuntos").upload(path, convertido, { contentType: "image/webp" });
  if (errorSubida) return { error: `No se pudo guardar el sticker: ${errorSubida.message}` };

  const { error } = await supabase.from("wa_stickers").insert({ nombre, path, creado_por: user.id });
  if (error) return { error: error.message };

  revalidatePath("/gerencia/marketing/whatsapp");
  return { error: null };
}

export async function alternarSticker(id: string, activo: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("wa_stickers").update({ activo }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/gerencia/marketing/whatsapp");
  return { error: null };
}

export async function borrarSticker(id: string, path: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  await supabase.storage.from("adjuntos").remove([path]);
  const { error } = await supabase.from("wa_stickers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/gerencia/marketing/whatsapp");
  return { error: null };
}

/** Manda un sticker del catálogo — se firma su URL y se llama a Meta, igual que un adjunto. */
export async function enviarStickerChat(conversacionId: string, stickerId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const [{ data: conversacion }, { data: sticker }] = await Promise.all([
    supabase.from("wa_conversaciones").select("telefono, estado").eq("id", conversacionId).maybeSingle(),
    supabase.from("wa_stickers").select("path").eq("id", stickerId).maybeSingle(),
  ]);
  if (!conversacion) return { error: "La conversación ya no existe" };
  if (!sticker) return { error: "Ese sticker ya no existe" };

  const { data: firmada, error: errorFirma } = await supabase.storage.from("adjuntos").createSignedUrl(sticker.path, SEGUNDOS_URL_ENVIO);
  if (errorFirma || !firmada) return { error: "No se pudo preparar el sticker para enviarlo" };

  const resultado = await enviarMedia(
    conversacionId,
    conversacion.telefono,
    { tipo: "sticker", link: firmada.signedUrl, mediaUrlStorage: sticker.path },
    user.id,
  );
  if (resultado.error) return resultado;

  if (conversacion.estado === "sin_atender") {
    await supabase.from("wa_conversaciones").update({ estado: "en_gestion" }).eq("id", conversacionId);
  }

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}

// ── Mandar equipo (0250) ────────────────────────────────────────────────

export interface EquipoParaMandar {
  sku: string;
  marca: string;
  modelo: string;
  nombre: string;
  categoria: string;
  segmento: string | null;
  capacidad: string | null;
  fotoUrl: string;
}

const NOMBRE_CATEGORIA_EQUIPO: Record<string, string> = {
  lavadora: "Lavadora",
  "lavadora-secadora": "Lavadora-secadora",
  secadora: "Secadora",
  planchador: "Planchador / calandria",
  coche: "Coche",
};

/** Los equipos activos con foto, para el buscador de «Mandar equipo». Sin repuestos ni servicios. */
export async function equiposParaMandar(): Promise<EquipoParaMandar[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos")
    .select("sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path")
    .eq("activo", true)
    .in("categoria", Object.keys(NOMBRE_CATEGORIA_EQUIPO))
    .not("foto_path", "is", null)
    .not("sku", "is", null)
    .order("categoria")
    .order("marca")
    .order("sku");
  return (data ?? []).map((p) => ({
    sku: p.sku,
    marca: p.marca,
    modelo: p.modelo,
    nombre: p.nombre,
    categoria: NOMBRE_CATEGORIA_EQUIPO[p.categoria] ?? p.categoria,
    segmento: p.segmento,
    capacidad: p.capacidad,
    fotoUrl: `https://crm.efameinsa.com${p.foto_path}`,
  }));
}

/** ¿Está conectado el catálogo de Meta? Decide si aparece la opción «del catálogo (con precio)». */
export async function catalogoWhatsappConectado(): Promise<boolean> {
  return !!process.env.WHATSAPP_CATALOGO_ID;
}

interface BloqueFichaTecnica {
  t?: string;
  texto?: string;
}

/** Tres o cuatro líneas de la ficha técnica, sin títulos, para el cuerpo de la tarjeta. */
function resumenDeFicha(ficha: unknown, maximo = 4): string[] {
  const bloques = (ficha as { bloques?: BloqueFichaTecnica[] } | null)?.bloques ?? [];
  return bloques
    .filter((b) => b.t !== "titulo" && b.texto && b.texto.trim().length > 12)
    .slice(0, maximo)
    .map((b) => `• ${b.texto!.trim().slice(0, 140)}`);
}

/**
 * Manda uno o varios equipos a la conversación. `modo` "ficha": una tarjeta con
 * foto y botones por cada equipo (hasta 3), SIN precio. `modo` "catalogo": el
 * producto del catálogo de Meta (uno) o la lista (varios), CON el precio de
 * lista que publica el catálogo.
 */
export async function mandarEquipoChat(
  conversacionId: string,
  skus: string[],
  modo: "ficha" | "catalogo",
  nota?: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };
  const limpios = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (limpios.length === 0) return { error: "Elija al menos un equipo" };
  if (modo === "ficha" && limpios.length > 3) return { error: "Como ficha se mandan hasta 3 equipos por vez; para más, use el catálogo" };

  const [{ data: conversacion }, { data: productos }] = await Promise.all([
    supabase.from("wa_conversaciones").select("telefono, estado").eq("id", conversacionId).maybeSingle(),
    supabase.from("productos").select("sku, marca, modelo, capacidad, categoria, foto_path, ficha").in("sku", limpios).eq("activo", true),
  ]);
  if (!conversacion) return { error: "La conversación ya no existe" };
  if (!productos?.length) return { error: "Esos equipos ya no están activos en el catálogo" };
  const ordenados = limpios.map((sku) => productos.find((p) => p.sku === sku)).filter((p): p is NonNullable<typeof p> => !!p);

  const titulo = (p: (typeof ordenados)[number]) => `${p.marca} ${p.modelo}${p.capacidad ? ` · ${p.capacidad}` : ""}`;
  const notaLimpia = nota?.trim().slice(0, 300) || "";

  if (modo === "ficha") {
    for (const p of ordenados) {
      if (!p.foto_path) return { error: `${titulo(p)} no tiene foto en el CRM` };
      const lineas = [NOMBRE_CATEGORIA_EQUIPO[p.categoria] ?? p.categoria, ...resumenDeFicha(p.ficha)];
      if (notaLimpia) lineas.push("", notaLimpia);
      const r = await enviarFichaEquipo(
        conversacionId,
        conversacion.telefono,
        { sku: p.sku, titulo: titulo(p), cuerpo: lineas.join("\n"), imagenUrl: `https://crm.efameinsa.com${p.foto_path}` },
        user.id,
      );
      if (r.error) return r;
    }
  } else {
    const catalogoId = process.env.WHATSAPP_CATALOGO_ID;
    if (!catalogoId) return { error: "El catálogo de Meta todavía no está conectado al número" };
    const cuerpo =
      notaLimpia ||
      (ordenados.length === 1
        ? `Le comparto la ficha de ${titulo(ordenados[0])}. Toque el producto para ver el detalle.`
        : "Le comparto las opciones que conversamos. Toque cada una para ver el detalle.");
    const r = await enviarProductosCatalogo(
      conversacionId,
      conversacion.telefono,
      { catalogoId, equipos: ordenados.map((p) => ({ sku: p.sku, titulo: titulo(p) })), cuerpo, encabezado: "Equipos Efameinsa" },
      user.id,
    );
    if (r.error) return r;
  }

  if (conversacion.estado === "sin_atender") {
    await supabase.from("wa_conversaciones").update({ estado: "en_gestion" }).eq("id", conversacionId);
  }
  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}
