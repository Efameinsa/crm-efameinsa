"use server";

import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { enviarCorreoN8n } from "@/lib/avisos-n8n";

/** Leído, cumplido o «lo veo luego» (0232). */
export async function acusarComunicado(
  comunicadoId: string,
  accion: "leido" | "cumplido" | "luego",
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("acusar_comunicado", { p_comunicado: comunicadoId, p_accion: accion });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  return { error: null };
}

/**
 * EL FEEDBACK DE LA WEB (Santos, 14-09; 0233): lo que la persona escribió se
 * guarda en su acuse —primero, para que no se pierda— y después se manda por
 * correo a quien lleva la web. Si eligió WhatsApp, la pantalla abre el chat
 * con el texto y acá solo queda registrado.
 */
export async function enviarFeedbackComunicado(datos: {
  comunicadoId: string;
  texto: string;
  via: "correo" | "whatsapp";
}): Promise<{ error: string | null; correoEnviado?: boolean }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("feedback_comunicado", {
    p_comunicado: datos.comunicadoId,
    p_texto: datos.texto,
    p_via: datos.via,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  if (datos.via !== "correo") return { error: null };

  const { data: c } = await supabase
    .from("comunicados")
    .select("titulo, feedback_correo")
    .eq("id", datos.comunicadoId)
    .maybeSingle();
  if (!c?.feedback_correo) return { error: null, correoEnviado: false };
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
  const quien = `${perfil.codigo_comercial ? `${perfil.codigo_comercial} · ` : ""}${perfil.nombre}`;
  const r = await enviarCorreoN8n({
    para: c.feedback_correo,
    asunto: `Feedback de la web · ${quien}`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:560px">` +
      `<h2 style="color:#7E1210;margin:0 0 6px">Feedback de la web</h2>` +
      `<p style="margin:2px 0;color:#6B6B6B">De <b style="color:#111">${esc(quien)}</b> · comunicado «${esc(c.titulo)}»</p>` +
      `<div style="white-space:pre-wrap;font-size:15px;background:#F6F4F2;padding:12px;border-radius:6px;margin-top:10px">${esc(datos.texto.trim())}</div>` +
      `<p style="color:#6B6B6B;font-size:12px;margin-top:10px">Enviado desde el CRM el ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}.</p>` +
      `</div>`,
  });
  // El texto ya quedó guardado en el CRM: si el correo no salió, se dice, pero
  // no se le hace escribir de nuevo.
  return { error: null, correoEnviado: !r.error };
}
