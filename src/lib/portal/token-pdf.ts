import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * EL ENLACE AL PDF QUE VE EL CLIENTE (Mi cuenta, 17-10).
 *
 * token = base64url(JSON {k, id, exp}) + "." + hex(HMAC-SHA256(PORTAL_SECRETO, parte1))
 * exp en milisegundos (epoch), una hora. Solo lo emite la consulta firmada
 * del portal (cliente.ts), así que quien tiene el enlace lo recibió con el
 * historial de ESE cliente.
 */

export type ClasePdf = "cotizacion" | "informe_servicio" | "informe_cierre";
const CLASES: ClasePdf[] = ["cotizacion", "informe_servicio", "informe_cierre"];
export const VIGENCIA_PDF_MS = 60 * 60 * 1000;

function sello(secreto: string, parte: string): string {
  return createHmac("sha256", secreto).update(parte).digest("hex");
}

export function crearTokenPdf(secreto: string, k: ClasePdf, id: string, ahora = Date.now()): string {
  const parte = Buffer.from(JSON.stringify({ k, id, exp: ahora + VIGENCIA_PDF_MS })).toString("base64url");
  return `${parte}.${sello(secreto, parte)}`;
}

export function leerTokenPdf(secreto: string | null | undefined, token: string | null | undefined, ahora = Date.now()): { k: ClasePdf; id: string } | null {
  if (!secreto || secreto.length < 16 || !token) return null;
  const [parte, firma, sobra] = token.split(".");
  if (!parte || !firma || sobra !== undefined || !/^[0-9a-f]{64}$/i.test(firma)) return null;
  const esperada = Buffer.from(sello(secreto, parte), "hex");
  const recibida = Buffer.from(firma.toLowerCase(), "hex");
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(parte, "base64url").toString("utf8")) as { k?: unknown; id?: unknown; exp?: unknown };
    if (!CLASES.includes(datos.k as ClasePdf)) return null;
    if (typeof datos.id !== "string" || !/^[0-9a-f-]{36}$/i.test(datos.id)) return null;
    if (typeof datos.exp !== "number" || datos.exp < ahora) return null;
    return { k: datos.k as ClasePdf, id: datos.id };
  } catch {
    return null;
  }
}

/** La URL pública del PDF (PORTAL_PUBLIC_URL o crm.efameinsa.com). */
export function urlPdfPortal(secreto: string, k: ClasePdf, id: string, ahora = Date.now()): string {
  const base = (process.env.PORTAL_PUBLIC_URL || "https://crm.efameinsa.com").replace(/\/+$/, "");
  return `${base}/api/portal/pdf?t=${encodeURIComponent(crearTokenPdf(secreto, k, id, ahora))}`;
}
