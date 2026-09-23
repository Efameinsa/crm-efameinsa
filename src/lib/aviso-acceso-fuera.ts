import { createAdminClient } from "@/lib/supabase/admin";
import { ipsDeLaOficina, zonaDeAcceso, describirEquipo } from "@/lib/accesos";
import { notificar } from "@/lib/notificaciones";

/**
 * EL AVISO DE ACCESO FUERA DE LA OFICINA (Santos con el Ing. Carlos, 23-09
 * 14:58). La decisión de gerencia fue «solo desde la oficina», pero Carlos y
 * Karen lo usan fuera y viene la fuerza de campo: por ahora no se bloquea, se
 * avisa. A gerencia le llega quién entró, desde dónde y con qué equipo, en el
 * momento, sin tener que abrir «Accesos y equipos».
 *
 * Una vez por persona e IP al día (si entra tres veces desde su casa, un solo
 * aviso). No avisa de gerencia ni admin —son quienes reciben el aviso—, ni de
 * las cuentas de práctica o de demostración. Nunca frena el ingreso: si algo
 * falla, solo queda en el log.
 */
export async function avisarAccesoFuera(userId: string, ip: string | null, userAgent: string | null): Promise<void> {
  try {
    if (!ip) return;
    const admin = createAdminClient();
    const { data: perfil } = await admin.from("perfiles").select("nombre, rol, codigo_comercial, es_prueba, espejo_de").eq("id", userId).maybeSingle();
    if (!perfil || ["gerencia", "admin"].includes(perfil.rol) || perfil.es_prueba || perfil.espejo_de) return;

    const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: accesos } = await admin.from("accesos").select("ip, user_id").gte("created_at", hace30).limit(5000);
    const zona = zonaDeAcceso(ip, ipsDeLaOficina((accesos ?? []) as { ip: string | null; user_id: string }[]));
    if (!zona.fuera) return;

    // Uno al día por persona e IP: el acceso de ahora ya está guardado, así que
    // si hay más de uno hoy desde esta IP, el aviso ya salió.
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const { count } = await admin
      .from("accesos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("ip", ip)
      .gte("created_at", `${hoy}T00:00:00-05:00`);
    if ((count ?? 0) > 1) return;

    const equipo = describirEquipo(userAgent);
    const hora = new Date().toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
    await notificar({
      rol: "gerencia",
      tipo: "urgencia",
      titulo: `Acceso fuera de la oficina · ${perfil.codigo_comercial ? `${perfil.codigo_comercial} ` : ""}${perfil.nombre}`,
      cuerpo: `${hora} · IP ${ip} · ${equipo.resumen}. Por ahora solo se avisa; no se bloquea.`,
      url: "/gerencia/accesos?ver=fuera",
    });
  } catch (e) {
    console.error("avisarAccesoFuera:", e instanceof Error ? e.message : e);
  }
}
