import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FORMA_TOKEN,
  LimiteDeTasa,
  leerJson,
  leerParametros,
  sinRepetidos,
  type EnvioApp,
} from "@/lib/campo-osmand";

/**
 * LA PUERTA DEL GPS DEL CELULAR (0367).
 *
 * Ing. Carlos (vía Santos, 01-10-2026): el recorrido de Brenda «lo más
 * preciso posible, como Uber o inDrive». Traccar Client, en el celular, manda
 * acá cada posición del GPS (protocolo OsmAnd, GET o POST, clásico o JSON:
 * ver lib/campo-osmand.ts). No hay sesión: la llave es el identificador que se
 * escribió en la app, que es el token de `dispositivos_campo`.
 *
 * Lo que responde, pensado para la app y no para una persona:
 *   200  recibido (también si el punto era malo o repetido: que no lo
 *        reintente para siempre).
 *   404  ese identificador no sirve (no existe, se desactivó, o la persona ya
 *        no está en el piloto). La app lo muestra como error: así se nota la
 *        configuración mal escrita.
 *   429  demasiados envíos; la app reintenta después.
 *   500  la base no respondió; la app guarda el punto y lo reintenta.
 * Nunca devuelve un dato: ni el nombre de la persona ni si el token existió.
 *
 * El proxy (src/proxy.ts) deja pasar esta ruta sin sesión, como los webhooks.
 */

export const dynamic = "force-dynamic";

/** Por celular: al volver la señal la app vacía la cola de golpe. */
const porToken = new LimiteDeTasa(600, 60_000);
/** Identificadores que no existen, por IP: el que prueba suerte se frena acá. */
const desconocidosPorIp = new LimiteDeTasa(20, 60_000);

interface Dispositivo {
  id: string;
  user_id: string;
}

/**
 * Un minuto de memoria por token: con un envío por minuto y por celular, la
 * consulta a la base se ahorra casi siempre. Desactivar un celular tarda a lo
 * más eso en surtir efecto.
 */
const CACHE_MS = 60_000;
const cache = new Map<string, { dispositivo: Dispositivo | null; hasta: number }>();
/** La última vez que se anotó `ultimo_envio_at` de cada celular (una vez por minuto basta). */
const ultimaMarca = new Map<string, number>();

async function buscarDispositivo(token: string): Promise<Dispositivo | null> {
  const ahora = Date.now();
  const enCache = cache.get(token);
  if (enCache && enCache.hasta > ahora) return enCache.dispositivo;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dispositivos_campo")
    .select("id, user_id, perfiles!inner(trabajo_de_campo)")
    .eq("token", token)
    .eq("activo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const perfil = (data as { perfiles?: { trabajo_de_campo?: boolean } | null } | null)?.perfiles;
  // Si gerencia sacó a la persona del piloto, su celular deja de anotar aunque siga encendido.
  const dispositivo = data && perfil?.trabajo_de_campo ? { id: data.id as string, user_id: data.user_id as string } : null;
  if (cache.size > 1000) cache.clear();
  cache.set(token, { dispositivo, hasta: ahora + CACHE_MS });
  return dispositivo;
}

function ipDe(request: NextRequest): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

const vacio = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

async function recibir(request: NextRequest, envio: EnvioApp): Promise<Response> {
  const ip = ipDe(request);
  const token = envio.token?.toLowerCase() ?? null;

  if (!token || !FORMA_TOKEN.test(token)) {
    return desconocidosPorIp.permitir(ip ?? "?") ? vacio(404) : vacio(429);
  }
  if (!porToken.permitir(token)) return vacio(429);

  try {
    const dispositivo = await buscarDispositivo(token);
    if (!dispositivo) {
      return desconocidosPorIp.permitir(ip ?? "?") ? vacio(404) : vacio(429);
    }

    const admin = createAdminClient();
    const posiciones = sinRepetidos(envio.posiciones);
    if (posiciones.length) {
      const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
      const filas = posiciones.map((p) => ({
        user_id: dispositivo.user_id,
        dispositivo_id: dispositivo.id,
        origen: "app",
        estado: "ok",
        lat: p.lat,
        lon: p.lon,
        precision_m: p.precision_m,
        velocidad_mps: p.velocidad_mps,
        rumbo: p.rumbo,
        bateria: p.bateria,
        registrada_at: p.registrada_at,
        detalle: p.detalle,
        ip,
        user_agent: userAgent,
      }));
      // La app reintenta lo que no tuvo respuesta: la misma hora del GPS del
      // mismo celular entra una vez (índice único de la 0367).
      const { error } = await admin
        .from("ubicaciones_campo")
        .upsert(filas, { onConflict: "dispositivo_id,registrada_at", ignoreDuplicates: true });
      if (error) {
        console.error("campo/osmand: no se guardó la posición:", error.message);
        return vacio(500);
      }
    }

    const ahora = Date.now();
    if (ahora - (ultimaMarca.get(dispositivo.id) ?? 0) >= 60_000) {
      ultimaMarca.set(dispositivo.id, ahora);
      const { error } = await admin
        .from("dispositivos_campo")
        .update({ ultimo_envio_at: new Date(ahora).toISOString() })
        .eq("id", dispositivo.id);
      if (error) console.error("campo/osmand: ultimo_envio_at:", error.message);
    }
    return vacio(200);
  } catch (e) {
    console.error("campo/osmand:", e instanceof Error ? e.message : e);
    return vacio(500);
  }
}

export async function GET(request: NextRequest) {
  return recibir(request, leerParametros(request.nextUrl.searchParams));
}

export async function POST(request: NextRequest) {
  // Un lote de la cola de la app pesa decenas de KB; más que esto no es la app.
  if (Number(request.headers.get("content-length") ?? 0) > 1_000_000) return vacio(413);
  const tipo = request.headers.get("content-type") ?? "";
  const crudo = await request.text().catch(() => "");
  const cuerpo = crudo.trim();

  // La app nueva: JSON (a veces sin decir que lo es).
  if (tipo.includes("json") || cuerpo.startsWith("{") || cuerpo.startsWith("[")) {
    try {
      const json = JSON.parse(cuerpo) as unknown;
      // Un lote como lista en la raíz: [{ device_id, location }, …], todos del mismo celular.
      if (Array.isArray(json)) {
        const partes = json.map((j) => leerJson(j));
        const token = partes.find((p) => p.token)?.token ?? null;
        return recibir(request, {
          token,
          posiciones: partes.filter((p) => p.token === token).flatMap((p) => p.posiciones),
          descartadas: partes.reduce((s, p) => s + p.descartadas, 0),
        });
      }
      const envio = leerJson(json);
      // JSON sin device_id pero con id en la URL: también vale.
      if (!envio.token) envio.token = leerParametros(request.nextUrl.searchParams).token;
      return recibir(request, envio);
    } catch {
      return vacio(400);
    }
  }

  // La app clásica: parámetros en la URL, o en un formulario en el cuerpo.
  const parametros = new URLSearchParams(request.nextUrl.searchParams);
  if (cuerpo) new URLSearchParams(cuerpo).forEach((v, k) => parametros.set(k, v));
  return recibir(request, leerParametros(parametros));
}
