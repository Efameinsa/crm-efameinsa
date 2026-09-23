import type { createClient } from "@/lib/supabase/server";

/**
 * LA GESTIÓN DE WHATSAPP, APARTE (Santos, 23-09).
 *
 * Marcar un chat con un botón («interesado», «cotizado», «no contesta») deja
 * una gestión en el expediente (whatsapp-campanas.ts, nota «Por WhatsApp: …»)
 * y hasta hoy se sumaba sin distinción a los seguimientos efectivos: el 22-09
 * fueron 55 de las 78 gestiones de Katerine. Decisión: «sí, pero crear una
 * aparte que sea gestión de WhatsApp; crear otra barra para los reportes
 * porque aún no tenemos bien definidos sus KPIs».
 *
 * Se cuentan acá, por persona y día, y cada reporte las muestra en su propia
 * barra. Si cuentan o no para la meta de gestiones lo dice
 * WHATSAPP_CUENTA_PARA_META: hoy sí (así la meta de nadie cambia de un día
 * para otro); cuando se definan sus KPIs basta con ponerlo en false.
 */
export const PREFIJO_MARCA_WHATSAPP = "Por WhatsApp:";
export const WHATSAPP_CUENTA_PARA_META = true;

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Las marcas de WhatsApp de cada persona ese día (fecha = YYYY-MM-DD de Lima). */
export async function marcasWhatsappDelDia(supabase: Cliente, fecha: string, ids: string[]): Promise<Map<string, number>> {
  const desde = `${fecha}T00:00:00-05:00`;
  const hasta = new Date(new Date(desde).getTime() + 86_400_000).toISOString();
  const pares = await Promise.all(
    ids.map(async (id) => {
      const { count } = await supabase
        .from("actividades")
        .select("id", { count: "exact", head: true })
        .eq("realizada_por", id)
        .eq("tipo", "whatsapp")
        .ilike("nota", `${PREFIJO_MARCA_WHATSAPP}%`)
        .gte("realizada_at", desde)
        .lt("realizada_at", hasta);
      return [id, count ?? 0] as const;
    }),
  );
  return new Map(pares);
}
