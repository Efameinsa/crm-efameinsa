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
 * WHATSAPP_CUENTA_PARA_META.
 *
 * 30-09: YA NO CUENTAN (ing. Carlos, reunión de las 12:35, mirando Control):
 * «no son seis gestiones sino seis WhatsApp… La idea es independizar. Cuando
 * tienen campañas, principalmente. WhatsApp es una corrida. El otro es tu
 * gestión». Los comerciales ya entendieron que la gestión que cuenta es la
 * efectiva; con las marcas de WhatsApp adentro pedían «más campañas, para
 * sumar». Desde hoy la meta de gestiones mide solo la gestión propia y el
 * WhatsApp de campaña tiene su propio indicador (indicadores-comerciales.ts):
 * cuántos chats de anuncio le llegaron, cuántos calificó el mismo día y en
 * cuánto responde.
 */
export const PREFIJO_MARCA_WHATSAPP = "Por WhatsApp:";
export const WHATSAPP_CUENTA_PARA_META = false;

/** ¿Esta gestión es una marca de un botón en un chat de campaña? */
export function esMarcaWhatsapp(tipo: string | null | undefined, nota: string | null | undefined): boolean {
  return tipo === "whatsapp" && (nota ?? "").startsWith(PREFIJO_MARCA_WHATSAPP);
}

/** Cuántas marcas hizo alguien un día: todas, y las que cayeron en un
 *  expediente de venta (las de un caso de postventa van a su propia cuenta). */
export interface MarcasDelDia {
  total: number;
  enVenta: number;
}

type Cliente = Awaited<ReturnType<typeof createClient>>;

/**
 * Las marcas de WhatsApp de cada persona ese día (fecha = YYYY-MM-DD de Lima).
 * Se separan las de venta de las de postventa porque la supervisión cuenta
 * unas en la meta y otras en «Postventa N»: restar todas del número de venta
 * descuadraría la tarjeta.
 */
export async function marcasWhatsappDelDia(supabase: Cliente, fecha: string, ids: string[]): Promise<Map<string, MarcasDelDia>> {
  const desde = `${fecha}T00:00:00-05:00`;
  const hasta = new Date(new Date(desde).getTime() + 86_400_000).toISOString();
  const resultado = new Map<string, MarcasDelDia>(ids.map((id) => [id, { total: 0, enVenta: 0 }]));
  if (ids.length === 0) return resultado;
  const { data } = await supabase
    .from("actividades")
    .select("realizada_por, oportunidades(tipo_postventa)")
    .in("realizada_por", ids)
    .eq("tipo", "whatsapp")
    .ilike("nota", `${PREFIJO_MARCA_WHATSAPP}%`)
    .gte("realizada_at", desde)
    .lt("realizada_at", hasta)
    .limit(1000);
  for (const f of data ?? []) {
    const m = resultado.get(f.realizada_por as string);
    if (!m) continue;
    m.total++;
    const op = f.oportunidades as unknown as { tipo_postventa: string | null } | null;
    if (!op?.tipo_postventa) m.enVenta++;
  }
  return resultado;
}
