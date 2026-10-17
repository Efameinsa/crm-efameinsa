import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LA FIRMA DEL PORTAL (contrato «Experiencia del cliente», 17-10).
 *
 * La web (efameinsa.com) le pregunta al CRM por el historial de un cliente
 * servidor a servidor. No hay sesión: cada pedido lleva
 *   x-portal-ts    = la hora en milisegundos (epoch)
 *   x-portal-firma = hex(HMAC-SHA256(PORTAL_SECRETO, `${ts}.${cuerpoCrudo}`))
 * y se rechaza si la hora se aleja más de 5 minutos o la firma no calza.
 * La comparación es en tiempo constante.
 */

export const CABECERA_TS = "x-portal-ts";
export const CABECERA_FIRMA = "x-portal-firma";
export const VENTANA_MS = 5 * 60 * 1000;

export function firmarPortal(secreto: string, ts: string | number, cuerpo: string): string {
  return createHmac("sha256", secreto).update(`${ts}.${cuerpo}`).digest("hex");
}

export type ResultadoFirma = { ok: true } | { ok: false; motivo: "sin_secreto" | "sin_cabeceras" | "hora" | "firma" };

export function verificarFirmaPortal(datos: {
  secreto: string | undefined | null;
  ts: string | null | undefined;
  firma: string | null | undefined;
  cuerpo: string;
  ahora?: number;
}): ResultadoFirma {
  const secreto = datos.secreto ?? "";
  // Sin secreto configurado, nada pasa: un secreto vacío sería una firma que cualquiera calcula.
  if (secreto.length < 16) return { ok: false, motivo: "sin_secreto" };
  const ts = (datos.ts ?? "").trim();
  const firma = (datos.firma ?? "").trim().toLowerCase();
  if (!/^\d{10,16}$/.test(ts) || !/^[0-9a-f]{64}$/.test(firma)) return { ok: false, motivo: "sin_cabeceras" };
  const ahora = datos.ahora ?? Date.now();
  if (Math.abs(ahora - Number(ts)) > VENTANA_MS) return { ok: false, motivo: "hora" };
  const esperada = Buffer.from(firmarPortal(secreto, ts, datos.cuerpo), "hex");
  const recibida = Buffer.from(firma, "hex");
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return { ok: false, motivo: "firma" };
  return { ok: true };
}
