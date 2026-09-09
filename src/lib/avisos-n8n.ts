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

/**
 * El aviso a Finanzas, por correo.
 *
 * NO PASA POR `CORREO_ENCENDIDO`, a propósito. Ese interruptor apaga las
 * alertas de leads que llegaban al correo de gerencia y que Carlos mandó
 * quitar el 04-09. Este es otro correo y lo pidió él mismo el 05-09: el aviso
 * que Central manda a Finanzas cuando un cliente termina de pagar, para que
 * quede escrito y no solo en un WhatsApp.
 *
 * Best-effort, como todo lo que sale por n8n: si el webhook está caído el
 * aviso se registra igual en el CRM, que es la fuente de verdad.
 */
export interface AvisoFinanzas {
  para: string;
  asunto: string;
  cuerpo: string;
  cliente: string;
  documento?: string | null;
  telefono?: string | null;
  registradoPor: string;
}

export async function avisarFinanzasN8n(datos: AvisoFinanzas): Promise<void> {
  const base = process.env.N8N_LEAD_WEBHOOK_URL;
  if (!base) return; // entorno sin n8n configurado: silencio, no error
  const url = base.replace("crm-lead-nuevo", "crm-aviso-finanzas");
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secreto: process.env.N8N_WEBHOOK_SECRET ?? "",
        ...datos,
        url_crm: enlaceApp("/central/derivados"),
        enviado: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error("avisos-n8n: no se pudo avisar a Finanzas por correo:", e instanceof Error ? e.message : e);
  }
}

/**
 * LA ORDEN DE TRABAJO AL ALMACÉN, por correo, cuando postventa programa la
 * atención.
 *
 * Carlos, 09-09, señalando el primer paso del circuito: «de aquí le demos la
 * orden, mediante el correo electrónico, desde CRM, le demos ya un correo
 * electrónico del calendario… esta es la solicitud de la atención de la
 * llamada, o la programación de llamada… y ya no le va a llenar nada, si no
 * todo está ahí. ¡Pum! Se jala».
 *
 * NO ES PARA EL CLIENTE. Al cliente le llega después el informe, y lo manda
 * postventa a mano — «nuestra función como postventa es enviarle el informe al
 * cliente». Esto es la orden interna para que el técnico haga la videollamada
 * o la visita sin volver a tipear nada.
 *
 * Y VA CON EL HISTORIAL DE LA MÁQUINA, que fue el otro pedido de esa reunión:
 * «cuando deriva esa llamada, tiene que ir con el histórico de las incidencias
 * de ese equipo».
 *
 * Interruptor propio (`ORDEN_TRABAJO_CORREO=si`) y no el de los avisos: el 04-09
 * Carlos mandó apagar las alertas que le llegaban a él, y esto es otra cosa
 * —una orden de trabajo a producción—, así que encender una no debe encender
 * la otra.
 *
 * Best-effort: si n8n no contesta, la atención queda programada igual. El CRM
 * es la fuente de verdad; el correo solo avisa.
 */
export interface AvisoAtencionProgramada {
  atencionId: string;
  codigo?: string | null;
  cliente: string;
  ruc?: string | null;
  tipo: string;
  equipo?: string | null;
  serie?: string | null;
  enGarantia?: boolean | null;
  reporto?: string | null;
  cuando: string;
  tecnico?: string | null;
  programadaPor?: string | null;
  /** Lo que ya le pasó a esta máquina, lo más reciente primero. */
  antecedentes?: { fecha: string; que: string }[];
}

export async function avisarAtencionProgramadaN8n(datos: AvisoAtencionProgramada): Promise<void> {
  if (process.env.ORDEN_TRABAJO_CORREO !== "si") return;
  const url = process.env.N8N_ORDEN_TRABAJO_URL;
  if (!url) return; // entorno sin n8n configurado: silencio, no error
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secreto: process.env.N8N_WEBHOOK_SECRET ?? "",
        ...datos,
        enlace: enlaceApp(`/postventa/atenciones/${datos.atencionId}`),
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error("avisos-n8n: no se pudo mandar la orden de trabajo:", e instanceof Error ? e.message : e);
  }
}
