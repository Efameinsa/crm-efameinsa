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

  const { data: conversacion } = await admin
    .from("wa_conversaciones")
    .select("ultimo_mensaje_cliente_at")
    .eq("id", conversacionId)
    .maybeSingle();

  if (!ventanaAbierta(conversacion?.ultimo_mensaje_cliente_at ?? null)) {
    return { error: "La ventana de 24 horas se cerró: use una plantilla o llame al cliente (fase 3, todavía no disponible)." };
  }

  const resultado = await llamarGraphAPI({ to: telefono, type: "text", text: { body: texto } });

  await admin.from("wa_mensajes").insert({
    conversacion_id: conversacionId,
    wamid: resultado.wamid,
    direccion: "saliente",
    tipo: "text",
    texto,
    estado: resultado.ok ? "enviado" : "fallido",
    enviado_por: enviadoPor,
    error: resultado.error ? { mensaje: resultado.error } : null,
    timestamp_meta: new Date().toISOString(),
  });

  if (resultado.ok) {
    await admin.from("wa_conversaciones").update({ ultimo_mensaje_at: new Date().toISOString() }).eq("id", conversacionId);
  }

  return { error: resultado.error };
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
