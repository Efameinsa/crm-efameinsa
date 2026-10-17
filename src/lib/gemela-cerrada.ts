import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ¿LA CONSULTA DE ESTE EXPEDIENTE YA SE RESOLVIÓ EN OTRO DEL MISMO CLIENTE?
 *
 * Desde el 09-09 (Ariana, YOPLAC OCHOA LISSETH) el expediente abierto avisa si
 * otro del mismo cliente se cerró DESPUÉS de lo último que se hizo acá. Medía
 * solo la fecha de cierre, y se le escapó el caso de Moisés del 15-10 (Jaime
 * Barahona): rechazó el expediente el 12-10 («busca equipo de uso doméstico»),
 * el 14-10 «Registrar seguimiento» le abrió uno nuevo —el rechazado no se
 * reusa— con «Seguimiento de cartera» para ese día, y sus dos gestiones
 * siguientes, ambas «Sin interés / no procede», las anotó en el rechazado. El
 * nuevo quedó vacío, vencido en la agenda, y el aviso no salía porque el
 * cierre (12-10) era anterior al nuevo (14-10).
 *
 * Ahora también cuenta lo que la MISMA persona siguió anotando en el expediente
 * cerrado de su área: si eso es posterior a lo último de acá, la consulta se
 * está llevando allá. Igual que antes, no archiva nada solo: avisa y ofrece.
 */

const ETAPAS_CERRADAS = ["venta", "rechazada", "derivada", "historico"];
// Los tipos que cuentan como contacto con el cliente (0090).
const TIPOS_CONTACTO = ["llamada", "whatsapp", "email", "visita", "showroom", "reunion_online"];

export type GemelaResuelta = {
  id: string;
  etapa: string;
  cerradaAt: string;
  motivo: string | null;
  /** La última gestión anotada allá DESPUÉS del cierre, si la hubo. */
  ultimaGestion: { fecha: string; nota: string | null } | null;
};

type Hermana = {
  id: string;
  etapa: string;
  cerrada_at: string;
  comercial_id: string | null;
  tipo_postventa: string | null;
  catalogo_motivos_rechazo: { nombre: string } | { nombre: string }[] | null;
};

export async function gemelaQueYaResolvio(
  supabase: SupabaseClient,
  op: { id: string; cuentaId: string | null; etapa: string; createdAt: string | null; comercialId: string | null; tipoPostventa: string | null },
): Promise<GemelaResuelta | null> {
  if (!op.cuentaId || ETAPAS_CERRADAS.includes(op.etapa)) return null;

  const [{ data: hermanasData }, { data: propia }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select("id, etapa, cerrada_at, comercial_id, tipo_postventa, catalogo_motivos_rechazo(nombre)")
      .eq("cuenta_id", op.cuentaId)
      .neq("id", op.id)
      .not("cerrada_at", "is", null)
      // Un expediente unido a otro (0530/0532) no es un cierre: todo lo suyo
      // está en la carpeta. Contarlo ofrecía archivar la carpeta buena (ECOLAV).
      .is("unida_a", null)
      .order("cerrada_at", { ascending: false })
      .limit(5),
    supabase
      .from("actividades")
      .select("realizada_at")
      .eq("oportunidad_id", op.id)
      .in("tipo", TIPOS_CONTACTO)
      .order("realizada_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const hermanas = (hermanasData ?? []) as unknown as Hermana[];
  if (!hermanas.length) return null;

  // Solo las de la misma persona y la misma área: lo que otra área anote en
  // su expediente cerrado no dice nada de esta consulta.
  const mismas = hermanas.filter(
    (h) => op.comercialId && h.comercial_id === op.comercialId && (h.tipo_postventa == null) === (op.tipoPostventa == null),
  );
  const { data: ultimaAlla } = mismas.length
    ? await supabase
        .from("actividades")
        .select("oportunidad_id, realizada_at, nota")
        .in("oportunidad_id", mismas.map((h) => h.id))
        .in("tipo", TIPOS_CONTACTO)
        .order("realizada_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
  let gemela = hermanas[0];
  let movimiento = ms(gemela.cerrada_at);
  let ultimaGestion: GemelaResuelta["ultimaGestion"] = null;
  if (ultimaAlla && ms(ultimaAlla.realizada_at) > movimiento) {
    const deEsa = mismas.find((h) => h.id === ultimaAlla.oportunidad_id);
    if (deEsa && ms(ultimaAlla.realizada_at) > ms(deEsa.cerrada_at)) {
      gemela = deEsa;
      movimiento = ms(ultimaAlla.realizada_at);
      ultimaGestion = { fecha: ultimaAlla.realizada_at, nota: ultimaAlla.nota ?? null };
    }
  }

  const aca = ms(propia?.realizada_at ?? op.createdAt);
  if (!aca || movimiento <= aca) return null;

  const motivo = Array.isArray(gemela.catalogo_motivos_rechazo)
    ? gemela.catalogo_motivos_rechazo[0]?.nombre ?? null
    : gemela.catalogo_motivos_rechazo?.nombre ?? null;
  return { id: gemela.id, etapa: gemela.etapa, cerradaAt: gemela.cerrada_at, motivo, ultimaGestion };
}
