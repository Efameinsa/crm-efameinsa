import { createAdminClient } from "@/lib/supabase/admin";
import { notificar } from "@/lib/notificaciones";

/**
 * A quién le suena la campana cuando el cliente hace algo en Mi cuenta:
 * el comercial dueño de la ficha y, si va ligado a un pedido o un caso,
 * el área de postventa (sin la cuenta que solo vende preventivo).
 *
 * Nunca rompe la respuesta al portal: un aviso que falla queda en el log.
 */
export async function avisarAlEquipo(datos: {
  cuentaId: string | null;
  conPostventa: boolean;
  esPrueba: boolean;
  titulo: string;
  cuerpo?: string;
  /** A dónde lleva la campana en postventa (el pedido o el caso). */
  urlPostventa?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const destinos = new Map<string, string | undefined>();

    if (datos.cuentaId) {
      const { data: cuenta } = await admin.from("cuentas").select("comercial_id").eq("id", datos.cuentaId).maybeSingle();
      const dueno = (cuenta as { comercial_id: string | null } | null)?.comercial_id;
      if (dueno) {
        const { data: p } = await admin.from("perfiles").select("id, activo, es_prueba").eq("id", dueno).maybeSingle();
        const perfil = p as { id: string; activo: boolean; es_prueba: boolean | null } | null;
        if (perfil?.activo && (perfil.es_prueba === true) === datos.esPrueba) destinos.set(perfil.id, `/comercial/cartera/${datos.cuentaId}`);
      }
    }

    if (datos.conPostventa) {
      const { data } = await admin
        .from("perfiles")
        .select("id")
        .eq("es_postventa", true)
        .eq("activo", true)
        .eq("solo_preventivo", false)
        .is("espejo_de", null)
        .eq("es_prueba", datos.esPrueba);
      for (const p of (data ?? []) as { id: string }[]) if (!destinos.has(p.id)) destinos.set(p.id, datos.urlPostventa);
    }

    await Promise.all(
      [...destinos].map(([userId, url]) => notificar({ userId, tipo: "portal", titulo: datos.titulo, cuerpo: datos.cuerpo, url })),
    );
  } catch (e) {
    console.error("[portal] avisar al equipo", e instanceof Error ? e.message : e);
  }
}

/** «20123456789 - HOTEL X SAC» → «HOTEL X SAC». */
export function sinDocumento(texto: string | null | undefined): string {
  return (texto ?? "").replace(/^\d{8,11}\s*-\s*/, "").trim() || "El cliente";
}
