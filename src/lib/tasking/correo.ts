import { enviarCorreoN8n } from "@/lib/avisos-n8n";
import { db } from "./db";
import type { Mensaje } from "./tipos";

export async function correoConfigurado() {
  return !!process.env.N8N_LEAD_WEBHOOK_URL;
}

/** Envía los correos que ya tocan, desde gestion1@ como el resto del CRM. */
export async function enviarCorreosPendientes(limite = 20) {
  if (!(await correoConfigurado())) return { enviados: 0, errores: 0, sinConfigurar: true };
  const { data, error } = await db().rpc("tomar_mensajes", { p_canal: "correo", p_limite: limite });
  if (error) throw new Error(error.message);
  const lote = (data ?? []) as Mensaje[];
  let enviados = 0;
  let errores = 0;
  for (const m of lote) {
    const r = await enviarCorreoN8n({ para: m.destino, asunto: m.asunto || "Aviso de Tasking", html: m.html || `<pre style="font-family:Arial,sans-serif">${m.cuerpo}</pre>`, deNombre: "Tasking · EFAMEINSA" });
    if (!r.error) {
      await db().from("mensajes").update({ estado: "enviado", enviado_en: new Date().toISOString(), error: null }).eq("id", m.id);
      enviados++;
    } else {
      const final = m.intentos >= 5;
      await db()
        .from("mensajes")
        .update({ estado: final ? "error" : "pendiente", error: r.error.slice(0, 500), enviar_en: new Date(Date.now() + 5 * 60_000).toISOString() })
        .eq("id", m.id);
      errores++;
    }
  }
  return { enviados, errores };
}
