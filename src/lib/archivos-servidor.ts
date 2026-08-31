import { createHmac } from "node:crypto";

/**
 * Los enlaces firmados hacia el servidor de archivos de la oficina.
 *
 * POR QUÉ. Santos, 31-08-2026: dejar de usar Cloudflare R2 como almacén y
 * servir los documentos —informes en PDF y Word, fotos por cliente, videos
 * cortos— desde el servidor de la empresa, «pero que nuestro CRM lo pueda
 * encontrar como si fuera una nube».
 *
 * CÓMO FUNCIONA, y por qué así. El CRM no lee el archivo ni lo reenvía: eso
 * obligaría a que el archivo viaje del servidor a Vercel y de Vercel al
 * navegador, dos veces por internet, para algo que está a un metro. Lo que hace
 * el CRM es FIRMAR un enlace, y el navegador se lo pide directo al servidor por
 * la red local: 11 MB/s medidos, sin salir a internet. Con R2 hoy todo baja de
 * afuera.
 *
 * Es el mismo mecanismo que ya usaba R2 —una URL que vence a los cinco
 * minutos—, solo que la firma la valida `scripts/servidor-archivos.mjs` en vez
 * de Cloudflare.
 *
 * LO QUE ESTE MÓDULO NO DECIDE: quién puede ver qué. Eso sigue viviendo en el
 * CRM y en las políticas de la base. Acá solo se firma lo que la pantalla ya
 * decidió mostrar.
 */

/** Cinco minutos, igual que las URL firmadas de R2 que esto reemplaza. */
const VIGENCIA_SEGUNDOS = 300;

function base() {
  // En la oficina esta dirección resuelve al servidor por la red local; desde
  // afuera, al túnel, si algún día se habilita. La misma URL, el camino más
  // corto en cada caso.
  return process.env.ARCHIVOS_URL ?? "";
}

function secreto() {
  return process.env.ARCHIVOS_SECRETO ?? "";
}

/** Si todavía no está configurado, las pantallas tienen que poder seguir. */
export function servidorDeArchivosActivo(): boolean {
  return Boolean(base() && secreto());
}

/**
 * Firma un enlace a un archivo del servidor.
 *
 * `rutaAbsoluta` es la ruta tal cual la ve el servidor de archivos, por ejemplo
 * `X:\S. PRIVADO\COINREFRI\INFORME TECNICO N°6608-2025.pdf`. Devuelve `null` si
 * el servidor de archivos no está configurado, para que quien llama muestre el
 * cartel de «no disponible» en vez de un enlace roto.
 */
export function enlaceFirmado(rutaAbsoluta: string, segundos = VIGENCIA_SEGUNDOS): string | null {
  if (!servidorDeArchivosActivo()) return null;
  const rutaB64 = Buffer.from(rutaAbsoluta, "utf8").toString("base64url");
  const vence = Math.floor(Date.now() / 1000) + segundos;
  const firma = createHmac("sha256", secreto()).update(`${rutaB64}.${vence}`).digest("base64url");
  const u = new URL("/archivo", base());
  u.searchParams.set("p", rutaB64);
  u.searchParams.set("e", String(vence));
  u.searchParams.set("s", firma);
  return u.toString();
}

export interface ElementoCarpeta {
  nombre: string;
  tipo: "archivo" | "carpeta";
  ext?: string;
  peso?: number | null;
  modificado?: string | null;
}

/**
 * Qué hay en la carpeta de UN cliente en el servidor.
 *
 * Es lo que arma la vista «Documentos del servidor» de la ficha: las carpetas
 * del servidor están organizadas por cliente, y esta llamada le pregunta a UNA
 * de ellas qué contiene. La firma lleva el prefijo «carpeta:» a propósito, para
 * que un enlace de archivo no sirva como enlace de listado ni al revés.
 *
 * Devuelve `null` si el servidor no está configurado o no responde: la pantalla
 * muestra su cartel de «no disponible» y sigue — nunca se cuelga esperando a
 * una máquina apagada.
 */
export async function listarCarpetaServidor(
  rutaCarpeta: string,
  msEspera = 2500,
): Promise<{ elementos: ElementoCarpeta[]; truncado: boolean } | null> {
  if (!servidorDeArchivosActivo()) return null;
  const rutaB64 = Buffer.from(rutaCarpeta, "utf8").toString("base64url");
  const vence = Math.floor(Date.now() / 1000) + VIGENCIA_SEGUNDOS;
  const firma = createHmac("sha256", secreto()).update(`carpeta:${rutaB64}.${vence}`).digest("base64url");
  const u = new URL("/carpeta", base());
  u.searchParams.set("p", rutaB64);
  u.searchParams.set("e", String(vence));
  u.searchParams.set("s", firma);
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(msEspera), cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { elementos: ElementoCarpeta[]; truncado: boolean };
    return { elementos: j.elementos ?? [], truncado: Boolean(j.truncado) };
  } catch {
    return null;
  }
}

/**
 * ¿Está vivo el servidor de archivos?
 *
 * Sirve para no ofrecerle a nadie un enlace que no va a abrir. Se consulta con
 * un tiempo de espera corto: si el servidor de la oficina está apagado, la
 * pantalla tiene que resolverse igual y rápido, no quedarse colgada — que es
 * justo el riesgo de depender de una máquina propia en vez de una nube.
 */
export async function servidorDeArchivosResponde(msEspera = 1500): Promise<boolean> {
  if (!servidorDeArchivosActivo()) return false;
  try {
    const corte = AbortSignal.timeout(msEspera);
    const r = await fetch(new URL("/estado", base()), { signal: corte, cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}
