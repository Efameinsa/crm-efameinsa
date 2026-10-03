/**
 * La auditoría de cuentas desde gerencia (0160): lo que saben el proxy, el
 * layout y la acción sobre las direcciones «ver1…ver9».
 *
 * Las ranuras existen porque el navegador guarda UNA sesión por dirección:
 * en `crm.efameinsa.com` es gerencia; en `ver1.efameinsa.com` es Katerine;
 * en `ver2` es Central. Tres pestañas, tres personas, sin pisarse.
 *
 * 30-09-2026 (0360): 9 ranuras y en un solo nivel (`ver1.efameinsa.com`, antes
 * `ver1.crm.efameinsa.com`). El CRM se sirve por el túnel de Cloudflare, cuyo
 * certificado gratuito cubre *.efameinsa.com pero no *.crm.efameinsa.com.
 */

export const RANURAS = 9;
export const DOMINIO_PRODUCCION = "crm.efameinsa.com";
export const DOMINIO_RANURAS = "efameinsa.com";
export const COOKIE_AUDITORIA = "auditoria";

/** Número de ranura si el host es una dirección de auditoría; null si no. */
export function ranuraDeHost(host: string | null | undefined): number | null {
  if (!host) return null;
  const h = host.toLowerCase();
  // También reconoce las viejas ver1…ver5.crm.efameinsa.com (pestañas abiertas).
  const m = /^ver([1-9])\.(efameinsa\.com|crm\.efameinsa\.com|localhost)(:\d+)?$/.exec(h);
  return m ? Number(m[1]) : null;
}

/** La dirección de una ranura, con el mismo esquema y puerto desde donde se abrió. */
export function hostDeRanura(ranura: number, hostActual: string): string {
  const h = hostActual.toLowerCase();
  const puerto = /:(\d+)$/.exec(h)?.[1];
  if (h.startsWith("localhost") || /\.localhost(:\d+)?$/.test(h)) {
    return `http://ver${ranura}.localhost${puerto ? `:${puerto}` : ""}`;
  }
  return `https://ver${ranura}.${DOMINIO_RANURAS}`;
}

/** Lo que va en la cookie de la franja: solo para mostrar, no autoriza nada. */
export interface InfoAuditoria {
  id: string;
  auditor: string;
  auditado: string;
  ranura: number;
}

export function codificarInfoAuditoria(i: InfoAuditoria): string {
  return Buffer.from(JSON.stringify(i), "utf8").toString("base64url");
}

export function decodificarInfoAuditoria(v: string | undefined): InfoAuditoria | null {
  if (!v) return null;
  try {
    const o = JSON.parse(Buffer.from(v, "base64url").toString("utf8"));
    if (o && typeof o.id === "string" && typeof o.auditor === "string" && typeof o.auditado === "string") return o as InfoAuditoria;
  } catch {
    /* cookie rota: se ignora */
  }
  return null;
}
