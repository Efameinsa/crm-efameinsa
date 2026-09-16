import { createHmac, randomUUID } from "node:crypto";

// Aviso saliente a Educanet (crece.efameinsa.com) por cada gestion comercial
// real: cotizacion enviada, venta cerrada, gestion registrada, o respuesta a
// un lead derivado por Central. Educanet usa esto para otorgar puntos de
// gamificacion (tope 400/mes) y mostrar la actividad en "Mis tareas".
//
// Mismo espiritu que avisos-n8n.ts: best-effort, env-gated, nunca bloquea el
// flujo del CRM (que ya guardo el dato real) si Educanet esta caido o no
// esta configurado en este entorno.
//
// Autenticacion: firma HMAC-SHA256 sobre el body, header X-Crm-Signature,
// igual que el webhook /api/sync/from-estratega que ya corre en Educanet.

type TipoEventoEducanet =
  | "cotizacion_creada"
  | "cierre_venta"
  | "gestion_registrada"
  | "lead_respondido";

interface PayloadEventoEducanet {
  tipo: TipoEventoEducanet;
  email: string;
  descripcion?: string;
  monto?: number;
  tiempoRespuestaMinutos?: number;
}

async function enviarEventoEducanet(datos: PayloadEventoEducanet): Promise<void> {
  const url = process.env.EDUCANET_WEBHOOK_URL;
  const secret = process.env.EDUCANET_WEBHOOK_SECRET;
  if (!url || !secret) return; // entorno sin Educanet configurado: silencio, no error

  const body = JSON.stringify({
    eventId: randomUUID(),
    fecha: new Date().toISOString(),
    ...datos,
  });
  const firma = createHmac("sha256", secret).update(body).digest("hex");

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Crm-Signature": `sha256=${firma}` },
      body,
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error(
      `avisos-educanet: no se pudo avisar "${datos.tipo}":`,
      e instanceof Error ? e.message : e,
    );
  }
}

export async function avisarCotizacionCreadaEducanet(datos: {
  email: string;
  monto?: number | null;
  codigo?: string | null;
}): Promise<void> {
  await enviarEventoEducanet({
    tipo: "cotizacion_creada",
    email: datos.email,
    monto: datos.monto ?? undefined,
    descripcion: datos.codigo ? `Cotización ${datos.codigo} enviada` : undefined,
  });
}

export async function avisarCierreVentaEducanet(datos: {
  email: string;
  monto?: number | null;
}): Promise<void> {
  await enviarEventoEducanet({
    tipo: "cierre_venta",
    email: datos.email,
    monto: datos.monto ?? undefined,
  });
}

export async function avisarGestionRegistradaEducanet(datos: {
  email: string;
  tipoGestion: string;
}): Promise<void> {
  await enviarEventoEducanet({
    tipo: "gestion_registrada",
    email: datos.email,
    descripcion: `Gestión registrada: ${datos.tipoGestion}`,
  });
}

export async function avisarLeadRespondidoEducanet(datos: {
  email: string;
  minutos: number;
}): Promise<void> {
  await enviarEventoEducanet({
    tipo: "lead_respondido",
    email: datos.email,
    tiempoRespuestaMinutos: datos.minutos,
  });
}
