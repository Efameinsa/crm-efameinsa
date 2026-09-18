import { createHmac, randomUUID } from "node:crypto";

// Aviso saliente a Educanet (crece.efameinsa.com) por cada gestion comercial
// real: cotizacion enviada, venta cerrada, gestion registrada, o respuesta a
// un lead derivado por Central. Educanet usa esto para otorgar puntos de
// gamificacion y mostrar la actividad en "Mis tareas".
//
// Desde el 18-09 el aviso lleva TODO lo que Educanet muestra y puntúa: el
// subtipo de gestión (llamada, visita, showroom…), el cliente, la nota y el
// resultado. Antes solo iba «Gestión registrada: llamada» y el comercial veía
// ocho filas iguales sin saber de qué cliente eran (reclamo de Santos al ver
// la cuenta de Brenda). Educanet calcula los puntos por subtipo y monto; el
// CRM no decide puntos.
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
  /** Subtipo de gestión del CRM: llamada, whatsapp, email, visita, showroom, reunion_online, filtro, nota, otro. */
  subtipo?: string;
  /** Razón social o nombre comercial del cliente al que se le hizo la gestión. */
  cliente?: string;
  /** Lo que el comercial escribió (recortado). */
  nota?: string;
  /** Resultado elegido del catálogo (p. ej. «No responde», «Pide cotización»). */
  resultado?: string;
  /** Número de cotización (Presu_123-26 / 045-2026). */
  codigo?: string;
}

const recortar = (texto: string | null | undefined, largo: number): string | undefined => {
  const limpio = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return undefined;
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio;
};

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
  cliente?: string | null;
}): Promise<void> {
  await enviarEventoEducanet({
    tipo: "cotizacion_creada",
    email: datos.email,
    monto: datos.monto ?? undefined,
    codigo: datos.codigo ?? undefined,
    cliente: recortar(datos.cliente, 80),
    descripcion: datos.codigo ? `Cotización ${datos.codigo} enviada` : undefined,
  });
}

export async function avisarCierreVentaEducanet(datos: {
  email: string;
  monto?: number | null;
  cliente?: string | null;
  codigo?: string | null;
}): Promise<void> {
  await enviarEventoEducanet({
    tipo: "cierre_venta",
    email: datos.email,
    monto: datos.monto ?? undefined,
    cliente: recortar(datos.cliente, 80),
    codigo: datos.codigo ?? undefined,
  });
}

export async function avisarGestionRegistradaEducanet(datos: {
  email: string;
  tipoGestion: string;
  cliente?: string | null;
  nota?: string | null;
  resultado?: string | null;
}): Promise<void> {
  await enviarEventoEducanet({
    tipo: "gestion_registrada",
    email: datos.email,
    subtipo: datos.tipoGestion,
    cliente: recortar(datos.cliente, 80),
    nota: recortar(datos.nota, 140),
    resultado: recortar(datos.resultado, 60),
    descripcion: `Gestión registrada: ${datos.tipoGestion}`,
  });
}

export async function avisarLeadRespondidoEducanet(datos: {
  email: string;
  minutos: number;
  cliente?: string | null;
}): Promise<void> {
  await enviarEventoEducanet({
    tipo: "lead_respondido",
    email: datos.email,
    tiempoRespuestaMinutos: datos.minutos,
    cliente: recortar(datos.cliente, 80),
  });
}
