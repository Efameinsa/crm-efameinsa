import { enlaceApp } from "@/lib/url-app";

// APAGADO POR ORDEN DE GERENCIA (Carlos, 04-09 por la tarde): «por favor,
// quítame ya todas las alertas que llegan a mi correo; todo lo estamos
// canalizando por el CRM propiamente». El aviso ya no se manda, pero el camino
// queda escrito: para volver a encenderlo basta poner AVISOS_CORREO=si en el
// entorno, sin tocar código.
const CORREO_ENCENDIDO = process.env.AVISOS_CORREO === "si";
// Aviso saliente a n8n por cada lead nuevo (pedido de gerencia 18-08:
// "correo por cada lead"). El CRM NO envía correos (sin SMTP): dispara un
// webhook a n8n y n8n hace el Gmail — el CRM sigue siendo la fuente de
// verdad, n8n solo notifica. Best-effort deliberado: si n8n está caído, el
// lead se crea igual (mismo criterio que el push de notificaciones.ts).

export interface AvisoLeadNuevo {
  titulo: string;
  codigo?: string | null;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  canal: string;
  razonSocial?: string | null;
  campania?: string | null;
  mensaje?: string | null;
}

export interface AvisoLeadDerivado {
  codigo?: string | null;
  nombre: string;
  razonSocial?: string | null;
  telefono?: string | null;
  canal: string;
  comercial: string;      // a quién se derivó
  derivadoPor?: string | null; // quién derivó (Central/gerencia)
}

// EL correo que gerencia realmente pidió (reunión 19-08): uno por
// DERIVACIÓN, no por llegada. La URL se deriva de la del timbre cambiando
// el path — así no hace falta otra variable en Vercel.
export async function avisarLeadDerivadoN8n(datos: AvisoLeadDerivado): Promise<void> {
  if (!CORREO_ENCENDIDO) return;
  const base = process.env.N8N_LEAD_WEBHOOK_URL;
  if (!base) return;
  const url = base.replace("crm-lead-nuevo", "crm-lead-derivado");
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secreto: process.env.N8N_WEBHOOK_SECRET ?? "", ...datos }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error("avisos-n8n: no se pudo avisar la derivación:", e instanceof Error ? e.message : e);
  }
}

export async function avisarLeadNuevoN8n(datos: AvisoLeadNuevo): Promise<void> {
  if (!CORREO_ENCENDIDO) return;
  const url = process.env.N8N_LEAD_WEBHOOK_URL;
  if (!url) return; // entorno sin n8n configurado: silencio, no error
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secreto: process.env.N8N_WEBHOOK_SECRET ?? "",
        ...datos,
        url_bandeja: enlaceApp("/central"),
        recibido: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error("avisos-n8n: no se pudo avisar el lead nuevo:", e instanceof Error ? e.message : e);
  }
}
