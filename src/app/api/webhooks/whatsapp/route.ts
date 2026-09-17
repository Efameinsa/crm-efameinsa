import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificarLeadEntrante } from "@/lib/notificaciones";

// Webhook de la Cloud API de WhatsApp (fase 2, plan sección 2.4).
//
// GET  → verificación que hace Meta al configurar la URL del webhook.
// POST → los eventos en sí: mensajes nuevos (`messages[]`) y cambios de
//        estado de los que mandamos nosotros (`statuses[]`).
//
// Regla de Meta que hay que respetar SIEMPRE: responder 200 rápido y sin
// bloquear — si tarda o falla, Meta reintenta el mismo evento, y sin
// deduplicar por `wamid` eso duplicaría mensajes en pantalla. Por eso el
// POST nunca deja pasar una excepción hacia afuera: cualquier fallo se
// registra en el log y de todos modos responde 200 (mismo criterio que
// `avisos-n8n.ts`: mejor-esfuerzo, nunca bloquear al que llama).

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const desafio = params.get("hub.challenge");

  if (modo === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(desafio, { status: 200 });
  }
  return NextResponse.json({ error: "Token de verificación inválido" }, { status: 403 });
}

interface CambioValorMensaje {
  messaging_product: "whatsapp";
  metadata?: { phone_number_id: string };
  contacts?: { profile?: { name?: string }; wa_id: string }[];
  messages?: {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; mime_type: string; caption?: string };
    document?: { id: string; mime_type: string; filename?: string; caption?: string };
    audio?: { id: string; mime_type: string };
    video?: { id: string; mime_type: string; caption?: string };
    sticker?: { id: string; mime_type: string };
    location?: { latitude: number; longitude: number; name?: string; address?: string };
    button?: { text: string; payload: string };
    /** Lo que el cliente tocó en una tarjeta con botones o en una lista (0250). */
    interactive?: {
      type: "button_reply" | "list_reply";
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string; description?: string };
    };
    /** Un pedido armado desde el catálogo de Meta. */
    order?: { catalog_id: string; text?: string; product_items?: { product_retailer_id: string; quantity: number; item_price: number; currency: string }[] };
    /** Cuando el cliente escribe «Preguntar» sobre un producto del catálogo. */
    context?: { from?: string; id?: string; referred_product?: { catalog_id: string; product_retailer_id: string } };
    referral?: {
      source_id?: string;
      source_url?: string;
      source_type?: string;
      headline?: string;
      body?: string;
      media_type?: string;
      image_url?: string;
      video_url?: string;
      ctwa_clid?: string;
    };
  }[];
  statuses?: {
    id: string;
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    errors?: { title: string }[];
  }[];
}

const ETIQUETA_BOTON: Record<string, string> = { interes: "Me interesa", cotizar: "Pide cotización", otro: "Quiere ver otra opción" };

function extraerTextoYTipo(m: NonNullable<CambioValorMensaje["messages"]>[number]): { tipo: string; texto: string | null; mediaId: string | null; equipoSku?: string | null } {
  switch (m.type) {
    case "text": {
      // «Preguntar» sobre un producto del catálogo llega como texto con el
      // producto referido en el contexto: se anota sobre qué equipo pregunta.
      const sku = m.context?.referred_product?.product_retailer_id ?? null;
      return { tipo: "text", texto: sku ? `${m.text?.body ?? ""}\n(sobre el equipo ${sku} del catálogo)` : (m.text?.body ?? ""), mediaId: null, equipoSku: sku };
    }
    case "interactive": {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      const [accion, sku] = (r?.id ?? "").split(":");
      const etiqueta = ETIQUETA_BOTON[accion] ?? r?.title ?? "Respondió";
      return { tipo: "interactive", texto: sku ? `${etiqueta} — ${sku}` : etiqueta, mediaId: null, equipoSku: sku || null };
    }
    case "order": {
      const items = m.order?.product_items ?? [];
      const lineas = items.map((i) => `${i.quantity} × ${i.product_retailer_id}`).join(", ");
      return { tipo: "order", texto: `Pedido desde el catálogo: ${lineas}${m.order?.text ? `\n${m.order.text}` : ""}`, mediaId: null, equipoSku: items.map((i) => i.product_retailer_id).join(",") || null };
    }
    case "image":
      return { tipo: "image" as const, texto: m.image?.caption ?? null, mediaId: m.image?.id ?? null };
    case "document":
      return { tipo: "document" as const, texto: m.document?.filename ?? m.document?.caption ?? null, mediaId: m.document?.id ?? null };
    case "audio":
      return { tipo: "audio" as const, texto: null, mediaId: m.audio?.id ?? null };
    case "video":
      return { tipo: "video" as const, texto: m.video?.caption ?? null, mediaId: m.video?.id ?? null };
    case "sticker":
      return { tipo: "sticker" as const, texto: null, mediaId: m.sticker?.id ?? null };
    case "location":
      return { tipo: "location" as const, texto: m.location ? `${m.location.name ?? ""} ${m.location.address ?? ""}`.trim() || `${m.location.latitude}, ${m.location.longitude}` : null, mediaId: null };
    case "button":
      return { tipo: "button" as const, texto: m.button?.text ?? null, mediaId: null };
    default:
      return { tipo: "unknown" as const, texto: null, mediaId: null };
  }
}

/**
 * Resuelve el código de campaña de un mensaje que llegó desde un anuncio:
 * primero por el `source_id` del referral contra `campanias_whatsapp.campaign_id`
 * (así funciona sin que el cliente escriba nada); si no hay match, se busca
 * el código `[M1-A]` dentro del texto del cuerpo del anuncio (`referral.body`,
 * que Meta copia el mensaje prellenado que el cliente mandó).
 */
async function resolverCodigoCampania(
  admin: ReturnType<typeof createAdminClient>,
  referral: NonNullable<CambioValorMensaje["messages"]>[number]["referral"],
  textoMensaje: string | null,
): Promise<string | null> {
  if (!referral && !textoMensaje) return null;

  if (referral?.source_id) {
    const { data } = await admin
      .from("campanias_whatsapp")
      .select("codigo")
      .eq("campaign_id", referral.source_id)
      .maybeSingle();
    if (data) return data.codigo;
  }

  const candidato = textoMensaje ?? referral?.body ?? "";
  const coincidencia = candidato.match(/\[([A-Z0-9-]+)\]/);
  if (coincidencia) {
    const { data } = await admin
      .from("campanias_whatsapp")
      .select("codigo")
      .ilike("codigo", coincidencia[1])
      .maybeSingle();
    if (data) return data.codigo;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const cuerpoTexto = await request.text();

  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (secreto) {
    const firma = request.headers.get("x-hub-signature-256");
    const esperada = "sha256=" + crypto.createHmac("sha256", secreto).update(cuerpoTexto).digest("hex");
    // timingSafeEqual exige buffers del MISMO largo — con uno falso o mal
    // formado (largo distinto) revienta en vez de comparar, y eso devolvía
    // 500 en lugar del 200 silencioso que se busca acá.
    const firmaValida =
      !!firma && Buffer.byteLength(firma) === Buffer.byteLength(esperada) && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
    if (!firmaValida) {
      console.error("webhook whatsapp: firma inválida");
      await dejarRastro(false, cuerpoTexto, "firma inválida");
      return NextResponse.json({}, { status: 200 }); // 200 igual: no darle pistas a quien intenta falsificar
    }
  }

  let cuerpo: { entry?: { changes?: { value: CambioValorMensaje }[] }[] };
  try {
    cuerpo = JSON.parse(cuerpoTexto);
  } catch {
    await dejarRastro(true, cuerpoTexto, "no es JSON");
    return NextResponse.json({});
  }

  const admin = createAdminClient();

  let fallo: string | null = null;
  try {
    for (const entrada of cuerpo.entry ?? []) {
      for (const cambio of entrada.changes ?? []) {
        await procesarValor(admin, cambio.value);
      }
    }
  } catch (err) {
    // Nunca se propaga: un fallo procesando un evento no debe hacer que Meta
    // reintente TODO el lote ni tumbar el webhook para el resto.
    console.error("webhook whatsapp: error procesando evento", err);
    fallo = err instanceof Error ? err.message : String(err);
  }
  await dejarRastro(true, cuerpoTexto, fallo);

  return NextResponse.json({});
}

/**
 * El rastro crudo de cada llamada (0248): la primera prueba real no apareció y
 * no había cómo saber si Meta llamó y falló la firma o si nunca llamó. Mejor
 * esfuerzo: si la tabla no está o falla el insert, el webhook sigue igual.
 */
async function dejarRastro(firmaValida: boolean, cuerpoTexto: string, error: string | null) {
  try {
    let cuerpo: unknown = null;
    try {
      cuerpo = JSON.parse(cuerpoTexto);
    } catch {
      /* queda solo el texto */
    }
    await createAdminClient().from("wa_webhook_eventos").insert({
      firma_valida: firmaValida,
      cuerpo,
      cuerpo_texto: cuerpo ? null : cuerpoTexto.slice(0, 4000),
      error,
    });
  } catch (err) {
    console.error("webhook whatsapp: no se pudo dejar el rastro", err);
  }
}

async function procesarValor(admin: ReturnType<typeof createAdminClient>, valor: CambioValorMensaje) {
  for (const status of valor.statuses ?? []) {
    const nuevoEstado = status.status === "sent" ? "enviado" : status.status === "delivered" ? "entregado" : status.status === "read" ? "leido" : "fallido";
    await admin
      .from("wa_mensajes")
      .update({ estado: nuevoEstado, error: status.errors?.length ? { detalle: status.errors[0].title } : null })
      .eq("wamid", status.id);
  }

  for (const mensaje of valor.messages ?? []) {
    // Dedupe: Meta reintenta si no respondimos 200 a tiempo la vez anterior.
    const { data: yaExiste } = await admin.from("wa_mensajes").select("id").eq("wamid", mensaje.id).maybeSingle();
    if (yaExiste) continue;

    const telefono = mensaje.from;
    const { tipo, texto, mediaId, equipoSku } = extraerTextoYTipo(mensaje);
    const nombreWa = valor.contacts?.find((c) => c.wa_id === telefono)?.profile?.name ?? null;
    const timestampMeta = new Date(Number(mensaje.timestamp) * 1000).toISOString();

    let { data: conversacion } = await admin
      .from("wa_conversaciones")
      .select("id, lead_id")
      .eq("telefono", telefono)
      .neq("estado", "cerrada")
      .maybeSingle();

    let esConversacionNueva = false;
    if (!conversacion) {
      esConversacionNueva = true;
      const codigoCampania = await resolverCodigoCampania(admin, mensaje.referral, texto);
      const { data: campania } = codigoCampania
        ? await admin.from("campanias_whatsapp").select("plataforma").ilike("codigo", codigoCampania).maybeSingle()
        : { data: null };

      // El mismo circuito de siempre (google-leads/route.ts): el lead nace
      // en pendiente_triaje, sin dueño, para que Central lo derive con sus
      // reglas de hoy (dedupe por teléfono, PIN si hace falta).
      const { data: lead } = await admin
        .from("leads")
        .insert({
          canal: "whatsapp",
          area_destino: "comercial",
          estado: "pendiente_triaje",
          nombre_contacto: nombreWa || "Sin nombre",
          telefono,
          mensaje: texto,
          fuente: mensaje.referral ? "meta_ads" : "whatsapp",
          codigo_campania_wa: codigoCampania,
          plataforma_campania_wa: codigoCampania ? (campania?.plataforma ?? "meta") : null,
          recibido_por: null,
        })
        .select("id, codigo")
        .single();

      const { data: nuevaConversacion } = await admin
        .from("wa_conversaciones")
        .insert({
          telefono,
          nombre_wa: nombreWa,
          lead_id: lead?.id ?? null,
          ctwa_clid: mensaje.referral?.ctwa_clid ?? null,
          referral: mensaje.referral ?? null,
          codigo_campania_wa: codigoCampania,
        })
        .select("id, lead_id")
        .single();
      conversacion = nuevaConversacion;

      if (lead) {
        await notificarLeadEntrante({
          titulo: "Nuevo WhatsApp de campaña",
          cuerpo: `${nombreWa || telefono}${codigoCampania ? ` · código ${codigoCampania}` : ""}`,
        });
      }
    }

    if (!conversacion) continue; // no debería pasar, pero sin conversación no hay dónde guardar el mensaje

    await admin.from("wa_mensajes").insert({
      conversacion_id: conversacion.id,
      wamid: mensaje.id,
      direccion: "entrante",
      tipo,
      texto,
      media_id: mediaId,
      equipo_sku: equipoSku ?? null,
      estado: "recibido",
      timestamp_meta: timestampMeta,
    });

    await admin
      .from("wa_conversaciones")
      .update({
        ultimo_mensaje_cliente_at: timestampMeta,
        ultimo_mensaje_at: timestampMeta,
        estado: esConversacionNueva ? "sin_atender" : undefined,
      })
      .eq("id", conversacion.id);
  }
}
