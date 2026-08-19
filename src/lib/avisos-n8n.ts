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

export async function avisarLeadNuevoN8n(datos: AvisoLeadNuevo): Promise<void> {
  const url = process.env.N8N_LEAD_WEBHOOK_URL;
  if (!url) return; // entorno sin n8n configurado: silencio, no error
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secreto: process.env.N8N_WEBHOOK_SECRET ?? "",
        ...datos,
        url_bandeja: "https://crm-efameinsa.vercel.app/central",
        recibido: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error("avisos-n8n: no se pudo avisar el lead nuevo:", e instanceof Error ? e.message : e);
  }
}
