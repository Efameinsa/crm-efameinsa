import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificar, notificarLeadEntrante } from "@/lib/notificaciones";
import { responderAutomatico } from "@/lib/whatsapp";
import { enviarEventoMeta } from "@/lib/meta-capi";

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
  // `wa_id` es el número; desde que WhatsApp estrenó los nombres de usuario,
  // quien oculta su número llega con `user_id` + `profile.username` (0264).
  contacts?: { profile?: { name?: string; username?: string }; wa_id?: string; user_id?: string }[];
  messages?: {
    from?: string;
    from_user_id?: string;
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

    // La llave de la conversación: el número si Meta lo manda, y si no el
    // identificador de usuario (0264). Sin ninguno de los dos no hay a quién
    // responder, así que el mensaje se descarta con rastro en el log.
    const telefono = mensaje.from ?? mensaje.from_user_id ?? null;
    if (!telefono) {
      console.error("webhook whatsapp: mensaje sin remitente", mensaje.id);
      continue;
    }
    const contacto = valor.contacts?.find((c) => c.wa_id === telefono || c.user_id === telefono) ?? valor.contacts?.[0];
    const usuarioWa = contacto?.profile?.username ?? null;
    // `from` es un número; `from_user_id` no. De eso depende si el contacto
    // puede llevar teléfono en su ficha.
    const esNumero = !!mensaje.from && /^[0-9]{6,15}$/.test(mensaje.from);
    const { tipo, texto, mediaId, equipoSku } = extraerTextoYTipo(mensaje);
    const nombreWa = contacto?.profile?.name ?? null;
    const timestampMeta = new Date(Number(mensaje.timestamp) * 1000).toISOString();

    let { data: conversacion } = await admin
      .from("wa_conversaciones")
      .select("id, lead_id, asignado_a, nombre_wa")
      .eq("telefono", telefono)
      .neq("estado", "cerrada")
      .maybeSingle();

    let esConversacionNueva = false;
    if (!conversacion) {
      esConversacionNueva = true;
      const codigoCampania = await resolverCodigoCampania(admin, mensaje.referral, texto);
      const { data: campania } = codigoCampania
        ? await admin.from("campanias_whatsapp").select("plataforma, nombre").ilike("codigo", codigoCampania).maybeSingle()
        : { data: null };

      // El lead nace en pendiente_triaje como siempre; lo que cambia desde el
      // 21-09 (0262) es que a renglón seguido se intenta asignar al comercial
      // de turno, sin pasar por Central. Lo que viene de un anuncio guarda
      // también el id del anuncio (utm_content) para los informes por origen.
      const { data: lead } = await admin
        .from("leads")
        .insert({
          canal: "whatsapp",
          area_destino: "comercial",
          estado: "pendiente_triaje",
          nombre_contacto: nombreWa || (usuarioWa ? `@${usuarioWa}` : "Sin nombre"),
          // Un identificador de usuario NO es un teléfono: meterlo acá haría
          // empatar fichas por «celular» con dígitos que no son de nadie (0264).
          telefono: esNumero ? telefono : null,
          mensaje: usuarioWa && !esNumero ? `${texto ?? ""}
(Escribió con su nombre de usuario de WhatsApp @${usuarioWa}; no comparte su número. Pídaselo por el chat.)`.trim() : texto,
          fuente: mensaje.referral ? "meta_ads" : "whatsapp",
          codigo_campania_wa: codigoCampania,
          plataforma_campania_wa: codigoCampania ? (campania?.plataforma ?? "meta") : null,
          utm_source: mensaje.referral ? "meta" : null,
          utm_medium: mensaje.referral ? "cpc" : null,
          utm_campaign: mensaje.referral?.headline ?? null,
          utm_content: mensaje.referral?.source_id ?? null,
          recibido_por: null,
        })
        .select("id, codigo")
        .single();

      const { data: nuevaConversacion } = await admin
        .from("wa_conversaciones")
        .insert({
          telefono,
          nombre_wa: nombreWa,
          usuario_wa: usuarioWa,
          lead_id: lead?.id ?? null,
          ctwa_clid: mensaje.referral?.ctwa_clid ?? null,
          referral: mensaje.referral ?? null,
          codigo_campania_wa: codigoCampania,
        })
        .select("id, lead_id, asignado_a, nombre_wa")
        .single();
      conversacion = nuevaConversacion;

      // Santos, 21-09: «no usaremos a la Central para derivar, enviaremos
      // directamente a cada vendedor». La base decide con las reglas de
      // siempre (0262): al turno del día si el número es libre; retenido
      // para Central si ya es cliente de otro comercial. Cada resultado
      // queda en `wa_asignaciones_automaticas`.
      const asignacion = lead && nuevaConversacion ? await asignarAlTurno(admin, lead.id, nuevaConversacion.id) : null;
      const producto = productoDeCampania(codigoCampania, campania?.nombre ?? null);
      const quien = `${nombreWa || telefono}${producto ? ` · ${producto}` : codigoCampania ? ` · código ${codigoCampania}` : ""}`;

      if (lead) {
        if (asignacion?.resultado === "asignado" && asignacion.comercial_id && nuevaConversacion) {
          await notificar({
            userId: asignacion.comercial_id,
            tipo: "lead_asignado",
            titulo: "Nuevo WhatsApp de campaña para usted",
            cuerpo: `${quien} · ${lead.codigo}`,
            url: `/whatsapp/${nuevaConversacion.id}`,
          });
          await notificar({
            rol: "gerencia",
            tipo: "lead_registrado",
            titulo: `WhatsApp de campaña → ${asignacion.comercial_codigo ?? asignacion.comercial_nombre ?? "turno"}`,
            cuerpo: quien,
            url: "/gerencia/marketing/whatsapp",
          });
        } else if (asignacion?.resultado === "retenido_cartera_ajena") {
          await notificarLeadEntrante({
            titulo: `WhatsApp de campaña retenido: ya es cliente de ${asignacion.dueno_codigo ?? asignacion.dueno_nombre ?? "otro comercial"}`,
            cuerpo: `${quien} · ${asignacion.razon_social ?? ""}`.trim(),
          });
        } else {
          await notificarLeadEntrante({
            titulo: "Nuevo WhatsApp de campaña",
            cuerpo: quien,
          });
        }
        // Meta se entera de que el anuncio produjo una conversación (0257).
        if (mensaje.referral?.ctwa_clid) await enviarEventoMeta({ evento: "Contact", leadId: lead.id, eventId: `${lead.id}:Contact` });
      }
      // El acuse (plan del 14-09, 2.7): al PRIMER mensaje de una conversación
      // nueva el número responde solo, para que nadie quede mirando la
      // pantalla. Dice quién lo atiende, cuándo, y pide de una vez los datos
      // que el vendedor necesita para cotizar (Santos, 21-09).
      if (nuevaConversacion?.id) {
        await responderAutomatico(
          nuevaConversacion.id,
          telefono,
          textoDeAcuse({ nombreComercial: asignacion?.resultado === "asignado" ? (asignacion.comercial_nombre ?? null) : null, producto }),
        );
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

    if (tipo === "interactive" && equipoSku) {
      await atenderBotonDeFicha(admin, conversacion, telefono, nombreWa, mensaje.interactive?.button_reply?.id ?? "", equipoSku);
    }
  }
}

/** Horario de atención en Lima: lunes a viernes 8-18, sábado 9-13. */
function enHorarioLima(): boolean {
  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const dia = ahora.getDay();
  const hora = ahora.getHours();
  return (dia >= 1 && dia <= 5 && hora >= 8 && hora < 18) || (dia === 6 && hora >= 9 && hora < 13);
}

/**
 * El acuse automático (Santos, 21-09: «la primera respuesta decide la
 * conversación… tú tienes que proponer cómo sería»). Tres cosas en un solo
 * mensaje: quién lo atiende (con nombre, si ya está asignado), cuándo, y los
 * tres datos que el vendedor necesita para cotizar sin ir y venir. El
 * cliente que responde con eso ya llega calificado a la bandeja.
 */
function textoDeAcuse(opciones: { nombreComercial?: string | null; producto?: string | null }): string {
  const saludo = "Hola, gracias por escribir a Efameinsa.";
  const consulta = opciones.producto ? ` Vi su consulta por ${opciones.producto}.` : "";
  const quien = opciones.nombreComercial ? `${opciones.nombreComercial} le atiende` : "Un asesor comercial le atiende";
  const cuando = enHorarioLima()
    ? "en unos minutos"
    : "apenas empiece la atención (lunes a viernes de 8:00 a 18:00, sábados de 9:00 a 13:00)";
  const pedido = "Para adelantar su cotización, ¿me indica el nombre de su negocio o RUC, la ciudad y cuántos kilos de ropa lava al día?";
  return `${saludo}${consulta} ${quien} ${cuando}.\n\n${pedido}`;
}

/** «Meta · LG Titan Max (imagen)» → «LG Titan Max». Solo para los códigos de anuncio (M1-A…), no para los de la web. */
function productoDeCampania(codigo: string | null, nombre: string | null): string | null {
  if (!codigo || !nombre || !/^M\d+-/i.test(codigo)) return null;
  const sinPrefijo = nombre.includes("·") ? nombre.slice(nombre.lastIndexOf("·") + 1) : nombre;
  const limpio = sinPrefijo.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return limpio || null;
}

interface ResultadoAsignacion {
  resultado: "asignado" | "retenido_cartera_ajena" | "retenido_sin_turno" | "retenido_error";
  comercial_id?: string;
  comercial_nombre?: string;
  comercial_codigo?: string | null;
  oportunidad_id?: string;
  cuenta_id?: string;
  razon_social?: string;
  dueno_id?: string;
  dueno_nombre?: string;
  dueno_codigo?: string | null;
  detalle?: string;
}

/** La asignación al turno (0262). Mejor esfuerzo: si la base falla, el contacto queda en la bandeja de Central como antes. */
async function asignarAlTurno(admin: ReturnType<typeof createAdminClient>, leadId: string, conversacionId: string): Promise<ResultadoAsignacion | null> {
  try {
    const { data, error } = await admin.rpc("asignar_lead_desde_whatsapp", { p_lead_id: leadId, p_conversacion_id: conversacionId });
    if (error) {
      console.error("webhook whatsapp: asignar_lead_desde_whatsapp", error.message);
      return { resultado: "retenido_error", detalle: error.message };
    }
    return (data ?? null) as ResultadoAsignacion | null;
  } catch (err) {
    console.error("webhook whatsapp: asignar_lead_desde_whatsapp", err);
    return { resultado: "retenido_error", detalle: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * El cliente tocó un botón de una ficha (0250). Santos, 17-09: «le dio en
 * pedir cotización y no pasó nada». Ahora pasan tres cosas: (1) el comercial
 * dueño del chat —o Central si nadie lo tiene— recibe el aviso en la campana
 * con el equipo; (2) el número le responde solo al cliente para que no se
 * quede mirando la pantalla; (3) queda como gestión en la oportunidad, si el
 * contacto ya tiene una. Nada de esto puede tumbar el webhook.
 */
async function atenderBotonDeFicha(
  admin: ReturnType<typeof createAdminClient>,
  conversacion: { id: string; lead_id: string | null; asignado_a: string | null; nombre_wa: string | null },
  telefono: string,
  nombreWa: string | null,
  idBoton: string,
  sku: string,
) {
  const accion = idBoton.split(":")[0];
  if (!["interes", "cotizar", "otro"].includes(accion)) return;
  try {
    const { data: p } = await admin.from("productos").select("marca, modelo, capacidad").eq("sku", sku).maybeSingle();
    const equipo = p ? `${p.marca} ${p.modelo}${p.capacidad ? ` ${p.capacidad}` : ""}`.replace(/\s+/g, " ").trim() : sku;
    const quien = nombreWa || conversacion.nombre_wa || telefono;
    const url = `/whatsapp/${conversacion.id}`;

    const titulo =
      accion === "cotizar" ? `${quien} pide cotización de ${equipo}` : accion === "interes" ? `${quien}: «me interesa» ${equipo}` : `${quien} quiere ver otra opción (vio ${equipo})`;
    await notificar({
      ...(conversacion.asignado_a ? { userId: conversacion.asignado_a } : { rol: "central" }),
      tipo: "whatsapp",
      titulo,
      cuerpo: accion === "cotizar" ? "Abra el chat y use «Cotizar este equipo»." : "Respóndale desde el chat.",
      url,
    });

    const respuesta =
      accion === "cotizar"
        ? `Perfecto. En unos minutos un asesor le manda la cotización de ${equipo}. ¿A qué nombre o empresa la emitimos?`
        : accion === "interes"
          ? `Qué bueno. ¿Le cuento más de ${equipo} o prefiere que lo llamemos?`
          : "Claro, en un momento le muestro otras opciones.";
    await responderAutomatico(conversacion.id, telefono, respuesta, sku);

    if (conversacion.lead_id) {
      const { data: lead } = await admin.from("leads").select("oportunidad_id").eq("id", conversacion.lead_id).maybeSingle();
      if (lead?.oportunidad_id) {
        await admin.from("actividades").insert({
          oportunidad_id: lead.oportunidad_id,
          tipo: "whatsapp",
          nota: `Por WhatsApp, el cliente ${accion === "cotizar" ? "pidió cotización de" : accion === "interes" ? "dijo «me interesa»" : "pidió ver otra opción distinta a"} ${equipo} (${sku}).`,
          realizada_por: conversacion.asignado_a,
          realizada_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error("webhook whatsapp: no se pudo atender el botón", err);
  }
}
