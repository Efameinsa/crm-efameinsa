import { createClient } from "@/lib/supabase/server";

/**
 * Dónde está la máquina desde la que se entró.
 *
 * POR QUÉ EXISTE. Las laptops son de la empresa y se las llevan; saber desde
 * dónde se está gestionando es saber dónde está el equipo. Carlos lo pidió el
 * 28-08 y Darwin confirmó que el seguimiento está en el contrato de los
 * empleados.
 *
 * QUÉ PRECISIÓN TIENE, para no mentirle a quien decide con esto: una IP ubica
 * al PROVEEDOR que la asigna —la central del barrio, la antena— con un margen
 * que en Lima es de kilómetros y que con datos móviles puede ser de decenas.
 * Responde «¿está en Lima, en Arequipa o en Ecuador?»; no responde «¿en qué
 * calle está?». Cualquier pantalla que muestre esto tiene que decirlo.
 *
 * CADA IP SE CONSULTA UNA SOLA VEZ y queda guardada (migración 0103). Así el
 * proveedor externo ve un puñado de IPs al mes y no el movimiento diario de
 * nadie, la pantalla abre sin esperar a nadie, y si el servicio se cae lo ya
 * sabido se sigue viendo.
 */

export interface Ubicacion {
  ip: string;
  ciudad: string | null;
  region: string | null;
  pais: string | null;
  paisCodigo: string | null;
  lat: number | null;
  lon: number | null;
  proveedor: string | null;
  /** «Lima, Perú» — lo que se lee en la fila. */
  etiqueta: string;
}

/** Las que no se le preguntan a nadie: no salen a internet. */
export function esIpPrivada(ip: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|::1|fe80:|fc|fd)/i.test(ip.trim());
}

export function etiquetaDe(u: { ciudad: string | null; region: string | null; pais: string | null }): string {
  const partes = [u.ciudad, u.region && u.region !== u.ciudad ? u.region : null, u.pais].filter(Boolean);
  return partes.length ? partes.join(", ") : "Sin ubicar";
}

interface Cruda {
  ciudad: string | null;
  region: string | null;
  pais: string | null;
  paisCodigo: string | null;
  lat: number | null;
  lon: number | null;
  proveedor: string | null;
  fuente: string;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};
const txt = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s && s !== "undefined" ? s : null;
};

/**
 * Dos proveedores, en este orden y no en el otro.
 *
 * Se probaron los dos con las IP reales de la empresa el 28-08: ip-api devuelve
 * el distrito —«Vitarte, Lima region»— y ipwho.is devuelve el centro de Lima
 * para TODAS, que para «dónde está la laptop» no dice nada: cuatro conexiones
 * distintas caían en el mismo punto del mapa. Así que manda el que distingue, y
 * el otro queda de paracaídas para el día en que el primero no conteste.
 *
 * Ninguno de los dos recibe quién es la persona — solo la IP.
 */
async function consultar(ip: string): Promise<Cruda | null> {
  try {
    const r = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,lat,lon,isp`,
      { signal: AbortSignal.timeout(6000), cache: "no-store" },
    );
    const j = (await r.json()) as Record<string, unknown>;
    if (j.status === "success") {
      return {
        ciudad: txt(j.city),
        region: txt(j.regionName),
        pais: txt(j.country),
        paisCodigo: txt(j.countryCode),
        lat: num(j.lat),
        lon: num(j.lon),
        proveedor: txt(j.isp),
        fuente: "ip-api.com",
      };
    }
  } catch {
    // Se intenta con el otro.
  }
  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    const j = (await r.json()) as Record<string, unknown>;
    if (j.success) {
      const conexion = j.connection as Record<string, unknown> | undefined;
      return {
        ciudad: txt(j.city),
        region: txt(j.region),
        pais: txt(j.country),
        paisCodigo: txt(j.country_code),
        lat: num(j.latitude),
        lon: num(j.longitude),
        proveedor: txt(conexion?.isp ?? conexion?.org),
        fuente: "ipwho.is",
      };
    }
  } catch {
    // Sin ubicación: la pantalla lo dirá.
  }
  return null;
}

/**
 * Las ubicaciones de un puñado de IPs: primero lo que ya se sabe, y solo lo que
 * falta se sale a preguntar.
 *
 * `maximoNuevas` acota cuánto puede tardar una carga de pantalla. Las que
 * queden sin resolver hoy se resuelven en la siguiente visita: la pantalla no
 * se cuelga esperando a un tercero.
 */
export async function ubicarIps(ips: string[], maximoNuevas = 12): Promise<Map<string, Ubicacion>> {
  const limpias = [...new Set(ips.filter(Boolean).map((i) => i.trim()))].filter((ip) => !esIpPrivada(ip));
  const salida = new Map<string, Ubicacion>();
  if (limpias.length === 0) return salida;

  const supabase = await createClient();
  const { data: guardadas } = await supabase
    .from("ubicaciones_ip")
    .select("ip, ciudad, region, pais, pais_codigo, lat, lon, proveedor")
    .in("ip", limpias);

  for (const u of guardadas ?? []) {
    const fila = {
      ip: u.ip as string,
      ciudad: u.ciudad as string | null,
      region: u.region as string | null,
      pais: u.pais as string | null,
      paisCodigo: u.pais_codigo as string | null,
      lat: u.lat != null ? Number(u.lat) : null,
      lon: u.lon != null ? Number(u.lon) : null,
      proveedor: u.proveedor as string | null,
    };
    salida.set(fila.ip, { ...fila, etiqueta: etiquetaDe(fila) });
  }

  const faltan = limpias.filter((ip) => !salida.has(ip)).slice(0, maximoNuevas);
  for (const ip of faltan) {
    const cruda = await consultar(ip);
    await supabase.from("ubicaciones_ip").upsert({
      ip,
      ciudad: cruda?.ciudad ?? null,
      region: cruda?.region ?? null,
      pais: cruda?.pais ?? null,
      pais_codigo: cruda?.paisCodigo ?? null,
      lat: cruda?.lat ?? null,
      lon: cruda?.lon ?? null,
      proveedor: cruda?.proveedor ?? null,
      fuente: cruda?.fuente ?? "sin respuesta",
      consultado_at: new Date().toISOString(),
      resuelta: cruda !== null,
    });
    if (cruda) {
      salida.set(ip, {
        ip,
        ciudad: cruda.ciudad,
        region: cruda.region,
        pais: cruda.pais,
        paisCodigo: cruda.paisCodigo,
        lat: cruda.lat,
        lon: cruda.lon,
        proveedor: cruda.proveedor,
        etiqueta: etiquetaDe(cruda),
      });
    }
  }

  return salida;
}
