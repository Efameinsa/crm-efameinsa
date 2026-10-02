import { createAdminClient } from "@/lib/supabase/admin";
import {
  VENTANA_MAXIMA_MIN,
  reglasQueSeCumplen,
  sanearDetalle,
  seVigila,
  type EventoSeguridad,
  type TipoEvento,
} from "@/lib/seguridad-conducta";

/**
 * ANOTAR LO QUE HACE UNA CUENTA CON LA INFORMACIÓN Y AVISAR A GERENCIA (0373).
 *
 * Solo servidor. Las reglas (cuántos eventos en cuánto tiempo) están en
 * `seguridad-conducta.ts`; acá se leen los últimos eventos de la persona, se
 * pregunta qué reglas se cumplen y, por cada una, se deja el aviso en la
 * campana y las notificaciones de gerencia y admin.
 *
 * NUNCA bloquea ni hace fallar nada: si algo sale mal, se queda en el registro
 * del servidor. Mirar no puede romper el trabajo de nadie.
 */

interface PerfilVigilado {
  nombre: string;
  rol: string | null;
  es_prueba: boolean;
}

const CINCO_MIN = 5 * 60_000;
const cachePerfiles = new Map<string, { perfil: PerfilVigilado | null; hasta: number }>();

async function perfilDe(userId: string): Promise<PerfilVigilado | null> {
  const ahora = Date.now();
  const enCache = cachePerfiles.get(userId);
  if (enCache && enCache.hasta > ahora) return enCache.perfil;
  const { data, error } = await createAdminClient().from("perfiles").select("nombre, rol, es_prueba").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  const perfil = data ? { nombre: String(data.nombre ?? "Una cuenta"), rol: (data.rol as string | null) ?? null, es_prueba: Boolean(data.es_prueba) } : null;
  if (cachePerfiles.size > 500) cachePerfiles.clear();
  cachePerfiles.set(userId, { perfil, hasta: ahora + CINCO_MIN });
  return perfil;
}

/** Dentro de este mismo proceso: dos eventos casi a la vez no deben dar dos avisos de la misma regla. */
const avisadoAqui = new Map<string, number>();

export interface EventoNuevo {
  userId: string;
  tipo: TipoEvento;
  origen: "app" | "web";
  detalle?: unknown;
  dispositivo?: string | null;
}

/**
 * Guarda el evento (si la cuenta se vigila) y evalúa las reglas. Devuelve true
 * si se anotó. No lanza: los errores quedan en el registro del servidor.
 */
export async function registrarEvento(e: EventoNuevo): Promise<boolean> {
  try {
    const perfil = await perfilDe(e.userId);
    if (!perfil || !seVigila(perfil)) return false;
    const admin = createAdminClient();
    const { error } = await admin.from("eventos_seguridad").insert({
      user_id: e.userId,
      tipo: e.tipo,
      origen: e.origen,
      detalle: sanearDetalle(e.tipo, e.detalle),
      dispositivo: e.dispositivo ? String(e.dispositivo).slice(0, 200) : null,
    });
    if (error) {
      console.error("registrarEvento(): no se pudo anotar", error.message);
      return false;
    }
    await evaluarYAvisar(e.userId, perfil);
    return true;
  } catch (err) {
    console.error("registrarEvento(): fallo", err);
    return false;
  }
}

export async function evaluarYAvisar(userId: string, perfil: PerfilVigilado): Promise<void> {
  const admin = createAdminClient();
  const ahora = Date.now();
  const [{ data: filas, error: e1 }, { data: previas, error: e2 }] = await Promise.all([
    admin
      .from("eventos_seguridad")
      .select("tipo, creado_at, detalle")
      .eq("user_id", userId)
      .gte("creado_at", new Date(ahora - VENTANA_MAXIMA_MIN * 60_000).toISOString())
      .order("creado_at", { ascending: false })
      .limit(1000),
    admin
      .from("alertas_seguridad")
      .select("regla, creada_at")
      .eq("user_id", userId)
      .gte("creada_at", new Date(ahora - 24 * 3_600_000).toISOString()),
  ]);
  if (e1 || e2) {
    console.error("evaluarYAvisar(): no se pudo leer", e1?.message ?? e2?.message);
    return;
  }

  const eventos: EventoSeguridad[] = (filas ?? []).map((f) => ({
    tipo: f.tipo as TipoEvento,
    t: Date.parse(f.creado_at as string),
    detalle: f.detalle as Record<string, unknown>,
  }));
  const ultimos: Record<string, number> = {};
  for (const p of previas ?? []) {
    const t = Date.parse(p.creada_at as string);
    const r = p.regla as string;
    if (!(r in ultimos) || t > ultimos[r]) ultimos[r] = t;
  }
  for (const [clave, t] of avisadoAqui) {
    const [u, regla] = clave.split("|");
    if (u === userId && (!(regla in ultimos) || t > ultimos[regla])) ultimos[regla] = t;
  }

  const avisos = reglasQueSeCumplen(eventos, ahora, ultimos);
  for (const a of avisos) {
    avisadoAqui.set(`${userId}|${a.regla}`, ahora);
    if (avisadoAqui.size > 2000) avisadoAqui.clear();
    const { error } = await admin.from("alertas_seguridad").insert({ user_id: userId, regla: a.regla, cuenta: a.cuenta, resumen: a.resumen });
    if (error) {
      console.error("evaluarYAvisar(): no se pudo anotar la alerta", error.message);
      continue;
    }
    // Las cuentas de práctica dejan la alerta en la pantalla de gerencia, pero no suenan en la campana:
    // quien prueba el CRM no debe despertar a gerencia.
    if (perfil.es_prueba) continue;
    try {
      const { notificar } = await import("@/lib/notificaciones");
      const datos = {
        tipo: "seguridad" as const,
        titulo: `Alerta de seguridad: ${perfil.nombre}`,
        cuerpo: `${perfil.nombre} ${a.resumen}.`,
        url: "/gerencia/accesos#seguridad",
      };
      await Promise.all([notificar({ rol: "gerencia", ...datos }), notificar({ rol: "admin", ...datos })]);
    } catch (err) {
      console.error("evaluarYAvisar(): no se pudo avisar a gerencia", err);
    }
  }
}
