import { createAdminClient } from "@/lib/supabase/admin";

// Envío por la Cloud API de Meta (fase 2, plan sección 2.5). Todo pasa por
// `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` con el
// token del usuario del sistema — no hay proveedor intermedio (BSP).
//
// Mientras no exista un WHATSAPP_TOKEN real, estas funciones fallan con un
// error claro en vez de silenciarse: así la bandeja avisa "no configurado"
// en lugar de fingir que el mensaje salió.

const VERSION_API = "v21.0";

function credenciales() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
}

/**
 * La ventana de 24 h de Meta: pasadas 24 horas desde el ÚLTIMO mensaje que
 * escribió el cliente, ya no se puede mandar texto libre (solo plantillas
 * aprobadas, fase 3). Se calcula acá —no en la base— porque es una regla de
 * negocio de Meta, no un estado que el CRM decida.
 */
export function ventanaAbierta(ultimoMensajeClienteAt: string | null): boolean {
  if (!ultimoMensajeClienteAt) return false;
  const horas = (Date.now() - new Date(ultimoMensajeClienteAt).getTime()) / 3_600_000;
  return horas < 24;
}

interface ResultadoEnvio {
  ok: boolean;
  wamid: string | null;
  error: string | null;
}

async function llamarGraphAPI(cuerpo: Record<string, unknown>): Promise<ResultadoEnvio> {
  const creds = credenciales();
  if (!creds) {
    return { ok: false, wamid: null, error: "WhatsApp todavía no está configurado (falta el token del número real o de pruebas)." };
  }

  try {
    const respuesta = await fetch(`https://graph.facebook.com/${VERSION_API}/${creds.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      const mensaje = datos?.error?.message ?? `Meta respondió ${respuesta.status}`;
      return { ok: false, wamid: null, error: mensaje };
    }
    const wamid = datos?.messages?.[0]?.id ?? null;
    return { ok: true, wamid, error: null };
  } catch (err) {
    return { ok: false, wamid: null, error: err instanceof Error ? err.message : "Error de red llamando a Meta" };
  }
}

/** La ventana de 24 h aplica a TODO mensaje libre, no solo texto — se comprueba una vez acá. */
async function comprobarVentana(admin: ReturnType<typeof createAdminClient>, conversacionId: string): Promise<string | null> {
  const { data: conversacion } = await admin
    .from("wa_conversaciones")
    .select("ultimo_mensaje_cliente_at")
    .eq("id", conversacionId)
    .maybeSingle();
  if (!ventanaAbierta(conversacion?.ultimo_mensaje_cliente_at ?? null)) {
    return "La ventana de 24 horas se cerró: use una plantilla o llame al cliente (fase 3, todavía no disponible).";
  }
  return null;
}

async function registrarEnvio(
  conversacionId: string,
  resultado: ResultadoEnvio,
  datos: { tipo: string; texto: string | null; enviadoPor: string; mediaUrlStorage?: string | null; equipoSku?: string | null },
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  await admin.from("wa_mensajes").insert({
    conversacion_id: conversacionId,
    wamid: resultado.wamid,
    direccion: "saliente",
    tipo: datos.tipo,
    texto: datos.texto,
    media_url_storage: datos.mediaUrlStorage ?? null,
    equipo_sku: datos.equipoSku ?? null,
    estado: resultado.ok ? "enviado" : "fallido",
    enviado_por: datos.enviadoPor,
    error: resultado.error ? { mensaje: resultado.error } : null,
    timestamp_meta: new Date().toISOString(),
  });

  if (resultado.ok) {
    await admin.from("wa_conversaciones").update({ ultimo_mensaje_at: new Date().toISOString() }).eq("id", conversacionId);
  }

  return { error: resultado.error };
}

/**
 * Manda texto libre y guarda el mensaje saliente. Respeta la ventana de 24 h
 * ANTES de llamar a Meta —para no gastar la llamada ni confundir con un
 * error de Meta lo que en realidad es "la ventana ya cerró"—.
 */
export async function enviarTexto(
  conversacionId: string,
  telefono: string,
  texto: string,
  enviadoPor: string,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const bloqueo = await comprobarVentana(admin, conversacionId);
  if (bloqueo) return { error: bloqueo };

  const resultado = await llamarGraphAPI({ to: telefono, type: "text", text: { body: texto } });
  return registrarEnvio(conversacionId, resultado, { tipo: "text", texto, enviadoPor });
}

export type TipoMedia = "image" | "document" | "audio" | "video" | "sticker";

/**
 * Manda una imagen, documento, audio o video por LINK: se sube antes al
 * bucket privado `adjuntos` (mismo que usan los adjuntos de un lead) y se le
 * pasa a Meta una URL firmada de corta duración — Meta la descarga en el
 * momento de mandar el mensaje, así que no hace falta el paso extra de subir
 * el archivo primero a los servidores de Meta.
 */
export async function enviarMedia(
  conversacionId: string,
  telefono: string,
  opciones: { tipo: TipoMedia; link: string; caption?: string; filename?: string; mediaUrlStorage: string },
  enviadoPor: string,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const bloqueo = await comprobarVentana(admin, conversacionId);
  if (bloqueo) return { error: bloqueo };

  const cuerpoMedia: Record<string, unknown> =
    opciones.tipo === "document"
      ? { link: opciones.link, caption: opciones.caption, filename: opciones.filename }
      : opciones.tipo === "audio" || opciones.tipo === "sticker"
        ? { link: opciones.link } // ninguna de las dos admite caption en la API de WhatsApp
        : { link: opciones.link, caption: opciones.caption };

  const resultado = await llamarGraphAPI({ to: telefono, type: opciones.tipo, [opciones.tipo]: cuerpoMedia });
  return registrarEnvio(conversacionId, resultado, {
    tipo: opciones.tipo,
    texto: opciones.caption || opciones.filename || null,
    enviadoPor,
    mediaUrlStorage: opciones.mediaUrlStorage,
  });
}

export interface FichaEquipoWa {
  sku: string;
  /** Lo que va en negrita arriba: «LG TITAN MAX · 17 kg». */
  titulo: string;
  /** El cuerpo: categoría y tres o cuatro líneas de la ficha técnica. Máximo 1024 caracteres (Meta). */
  cuerpo: string;
  /** Foto pública (crm.efameinsa.com/productos/…): Meta la baja al mandar. */
  imagenUrl: string;
}

/**
 * «Mandar equipo» como FICHA (Santos, 17-09): la foto del CRM arriba, el texto
 * de la ficha en el cuerpo, y tres botones de respuesta. No pasa por el
 * catálogo de Meta, así que no lleva precio —la decisión de gerencia para la
 * web (sin precios en esta etapa) se respeta— y funciona aunque el catálogo
 * no esté conectado. Lo que el cliente toque vuelve por el webhook como
 * `interactive.button_reply` con el id `interes:SKU` / `cotizar:SKU` / `otro:SKU`.
 */
export async function enviarFichaEquipo(
  conversacionId: string,
  telefono: string,
  equipo: FichaEquipoWa,
  enviadoPor: string,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const bloqueo = await comprobarVentana(admin, conversacionId);
  if (bloqueo) return { error: bloqueo };

  const resultado = await llamarGraphAPI({
    to: telefono,
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "image", image: { link: equipo.imagenUrl } },
      body: { text: `*${equipo.titulo}*\n${equipo.cuerpo}`.slice(0, 1024) },
      footer: { text: "Efameinsa · Ingeniería peruana certificada" },
      action: {
        buttons: [
          { type: "reply", reply: { id: `interes:${equipo.sku}`, title: "Me interesa" } },
          { type: "reply", reply: { id: `cotizar:${equipo.sku}`, title: "Pedir cotización" } },
          { type: "reply", reply: { id: `otro:${equipo.sku}`, title: "Ver otra opción" } },
        ],
      },
    },
  });
  return registrarEnvio(conversacionId, resultado, { tipo: "interactive", texto: `Ficha: ${equipo.titulo}`, enviadoPor, equipoSku: equipo.sku });
}

/**
 * «Mandar equipo» desde el CATÁLOGO de Meta (WHATSAPP_CATALOGO_ID): uno solo
 * va como tarjeta de producto; varios, como lista de productos (hasta 30). El
 * cliente ve la foto, el título, la descripción y el PRECIO del catálogo — por
 * eso se ofrece aparte de la ficha. Si toca «Preguntar» o arma un pedido,
 * vuelve por el webhook con `context.referred_product` u `order`.
 */
export async function enviarProductosCatalogo(
  conversacionId: string,
  telefono: string,
  datos: { catalogoId: string; equipos: { sku: string; titulo: string }[]; cuerpo: string; encabezado?: string },
  enviadoPor: string,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const bloqueo = await comprobarVentana(admin, conversacionId);
  if (bloqueo) return { error: bloqueo };
  if (datos.equipos.length === 0) return { error: "Elija al menos un equipo" };

  const interactive =
    datos.equipos.length === 1
      ? {
          type: "product",
          body: { text: datos.cuerpo.slice(0, 1024) },
          footer: { text: "Efameinsa" },
          action: { catalog_id: datos.catalogoId, product_retailer_id: datos.equipos[0].sku },
        }
      : {
          type: "product_list",
          header: { type: "text", text: (datos.encabezado ?? "Opciones para usted").slice(0, 60) },
          body: { text: datos.cuerpo.slice(0, 1024) },
          footer: { text: "Efameinsa" },
          action: {
            catalog_id: datos.catalogoId,
            sections: [{ title: "Equipos", product_items: datos.equipos.slice(0, 30).map((e) => ({ product_retailer_id: e.sku })) }],
          },
        };
  const resultado = await llamarGraphAPI({ to: telefono, type: "interactive", interactive });
  const titulos = datos.equipos.map((e) => e.titulo).join(", ");
  return registrarEnvio(conversacionId, resultado, {
    tipo: "interactive",
    texto: `Catálogo: ${titulos}`,
    enviadoPor,
    equipoSku: datos.equipos.map((e) => e.sku).join(","),
  });
}

/** Marca un mensaje entrante como leído en Meta (se llama al abrir el hilo, no al recibirlo). */
export async function marcarLeido(wamid: string): Promise<void> {
  const creds = credenciales();
  if (!creds) return;
  try {
    await fetch(`https://graph.facebook.com/${VERSION_API}/${creds.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }),
    });
  } catch (err) {
    console.error("marcarLeido(): fallo al avisar a Meta", err);
  }
}
