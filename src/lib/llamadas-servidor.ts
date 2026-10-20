import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { FORMA_TOKEN, LimiteDeTasa } from "@/lib/campo-osmand";

/**
 * LO QUE LA API DE LLAMADAS NECESITA DEL SERVIDOR (Santos, 19-10-2026).
 *
 * Quién llama a la API, dónde se guardan los archivos y cómo se valida lo que
 * llega. Los nombres y las carpetas los decide `lib/llamadas.ts`; acá solo se
 * toca el disco, y solo dentro de la raíz LLAMADAS_DIR (en la VM, /srv/llamadas).
 * Sin esa variable —por ejemplo en la copia de la nube— la función se apaga:
 * el audio no puede quedar en un disco que no es el de la oficina.
 */

/** La raíz donde viven los audios y transcripciones, o null si esta copia del CRM no los guarda. */
export function raizLlamadas(): string | null {
  const r = process.env.LLAMADAS_DIR?.trim();
  return r ? path.resolve(r) : null;
}

/**
 * Una ruta relativa de la base → la ruta real en el disco, SIEMPRE dentro de la
 * raíz. Si alguien lograra meter `../../etc/passwd` en `ruta_audio`, esto lo
 * rechaza en vez de leer un archivo ajeno.
 */
export function rutaEnDisco(relativa: string): string | null {
  const raiz = raizLlamadas();
  if (!raiz || !relativa) return null;
  const destino = path.resolve(raiz, relativa);
  return destino === raiz || !destino.startsWith(raiz + path.sep) ? null : destino;
}

export interface Quien {
  userId: string;
  /** Con el token del celular; null si entró con la sesión (PWA / pantalla). */
  dispositivoId: string | null;
}

/** Un minuto de memoria por token, como el del GPS: desactivar un celular tarda a lo más eso. */
const CACHE_MS = 60_000;
const cache = new Map<string, { quien: Quien | null; hasta: number }>();
const porToken = new LimiteDeTasa(120, 60_000);
const desconocidosPorIp = new LimiteDeTasa(20, 60_000);

function ipDe(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

async function quienPorToken(token: string): Promise<Quien | null> {
  const ahora = Date.now();
  const enCache = cache.get(token);
  if (enCache && enCache.hasta > ahora) return enCache.quien;
  const { data, error } = await createAdminClient()
    .from("dispositivos_campo")
    .select("id, user_id, perfiles!inner(activo)")
    .eq("token", token)
    .eq("activo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const perfil = (data as { perfiles?: { activo?: boolean | null } | null } | null)?.perfiles;
  const quien = data && perfil?.activo !== false ? { userId: data.user_id as string, dispositivoId: data.id as string } : null;
  if (cache.size > 1000) cache.clear();
  cache.set(token, { quien, hasta: ahora + CACHE_MS });
  return quien;
}

export type ResultadoAcceso = { ok: true; quien: Quien } | { ok: false; estado: 401 | 429 };

/**
 * ¿Quién está llamando? Dos puertas:
 *  · el celular, con `Authorization: Bearer <token>` (el de `dispositivos_campo`,
 *    el mismo del GPS): sin cookies, por eso esta ruta no pasa por el proxy;
 *  · la persona, con su sesión (la PWA y las pantallas).
 * Nunca se dice POR QUÉ falló: ni si el token existió ni de quién era.
 */
export async function acceso(request: Request): Promise<ResultadoAcceso> {
  const cabecera = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(cabecera)?.[1] ?? null;
  if (token) {
    const ip = ipDe(request) ?? "sin-ip";
    if (!FORMA_TOKEN.test(token)) return desconocidosPorIp.permitir(ip) ? { ok: false, estado: 401 } : { ok: false, estado: 429 };
    if (!porToken.permitir(token)) return { ok: false, estado: 429 };
    const quien = await quienPorToken(token);
    if (!quien) return desconocidosPorIp.permitir(ip) ? { ok: false, estado: 401 } : { ok: false, estado: 429 };
    return { ok: true, quien };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, estado: 401 };
  const { data: perfil } = await supabase.from("perfiles").select("activo").eq("id", user.id).maybeSingle();
  if (!perfil || perfil.activo === false) return { ok: false, estado: 401 };
  return { ok: true, quien: { userId: user.id, dispositivoId: null } };
}

/** Lo que manda el celular (o la PWA) al empezar o terminar una llamada. */
export const LlamadaSchema = z.object({
  // El uuid lo genera el celular: reintentar no duplica.
  id: z.string().uuid(),
  numero: z.string().trim().min(4).max(30),
  iniciada_at: z.string().datetime({ offset: true }),
  duracion_s: z.number().int().min(0).max(4 * 60 * 60),
  origen: z.enum(["app", "pwa"]).default("app"),
  // Lo que el celular ya sabe del audio: que no lo halló, o que no graba.
  estado_audio: z.enum(["pendiente", "no_encontrado", "no_disponible"]).optional(),
  // La ficha desde la que se tocó «Llamar», si se tocó desde una.
  cuenta_id: z.string().uuid().optional(),
  contacto_id: z.string().uuid().optional(),
});
export type LlamadaEntrante = z.infer<typeof LlamadaSchema>;

/** Los formatos de audio que se aceptan y con qué extensión se guardan. */
const EXTENSIONES: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/x-matroska": "mka",
  "audio/matroska": "mka",
};

export function extensionDeAudio(contentType: string | null): string | null {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return EXTENSIONES[t] ?? null;
}

export function tipoDeExtension(ext: string): string {
  const inverso = Object.entries(EXTENSIONES).find(([, e]) => e === ext)?.[0];
  return inverso ?? "application/octet-stream";
}

/** Un audio de llamada pesa unos pocos MB; más que esto no es una llamada. */
export const AUDIO_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Escribe el audio en `por-dia/…` y deja un ENLACE DURO en `por-cliente/…`: el
 * mismo archivo con dos nombres de carpeta, sin ocupar el doble. Si el disco no
 * admite enlaces, se copia. Un fallo en la carpeta por cliente no tira la
 * subida: el audio ya está a salvo en `por-dia`.
 */
export async function guardarAudio(opciones: {
  carpetaDia: string;
  carpetaCliente: string;
  nombre: string;
  extension: string;
  datos: Uint8Array;
}): Promise<{ ruta: string }> {
  const raiz = raizLlamadas();
  if (!raiz) throw new Error("LLAMADAS_DIR no está configurada");
  const archivo = `${opciones.nombre}.${opciones.extension}`;
  const ruta = `${opciones.carpetaDia}/${archivo}`;
  const destino = rutaEnDisco(ruta);
  if (!destino) throw new Error("ruta fuera de la raíz");
  await fs.mkdir(path.dirname(destino), { recursive: true });
  // Se escribe a un temporal y se renombra: el servicio de transcripción nunca ve medio archivo.
  const temporal = `${destino}.parte`;
  await fs.writeFile(temporal, opciones.datos);
  await fs.rename(temporal, destino);

  const copia = rutaEnDisco(`${opciones.carpetaCliente}/${archivo}`);
  if (copia) {
    try {
      await fs.mkdir(path.dirname(copia), { recursive: true });
      await fs.rm(copia, { force: true });
      try {
        await fs.link(destino, copia);
      } catch {
        await fs.copyFile(destino, copia);
      }
    } catch (e) {
      console.error("llamadas: no se pudo dejar la copia por cliente:", e instanceof Error ? e.message : e);
    }
  }
  return { ruta };
}
