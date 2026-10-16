import type { SupabaseClient } from "@supabase/supabase-js";
import { ETIQUETA_ETAPA, queLeFalta, tituloDelTipo, type Atencion, type EtapaAtencion } from "@/lib/atenciones";

/**
 * «PROBLEMAS TÉCNICOS Y SU ESTADO» en el reporte diario de postventa (Santos,
 * 16-10: «poner un apartado solo de problemas técnicos y su estado»). Los
 * casos de problema técnico asignados a la persona: los abiertos, con su paso,
 * lo que falta y a quién le toca, y los que cerró ese día. Es el estado al
 * generar el reporte. Llave de servicio: la ruta ya autorizó.
 *
 * Reunión 16-10 17:57: el de Hotelera Turística Amazonas («el cliente lo mandó
 * a arreglar con un técnico particular») no salía: estaba como tipo «Otro»,
 * asignado a Rubí, y lo tomó y cerró Ariana. Cuentan los casos técnicos
 * (problema técnico, revisión por garantía, soporte, «Otro») de quien los
 * TOMÓ o, si nadie los tomó, de quien los tiene asignados.
 */
export interface ProblemaTecnicoFila {
  cliente: string;
  /** El tipo, cuando no es «Problema técnico». */
  tipo: string | null;
  equipo: string | null;
  etapa: string;
  falta: string;
  /** El motivo del cierre, en su propia línea. */
  motivo: string | null;
  leToca: string;
  dias: number;
  urgente: boolean;
  cerradoHoy: boolean;
}

export interface ProblemasTecnicos {
  filas: ProblemaTecnicoFila[];
  /** Cuántos abiertos hay en cada paso, en el orden del circuito. */
  porEtapa: { etapa: string; total: number }[];
  abiertos: number;
  cerradosHoy: number;
}

const LIMA = "-05:00";
const TIPOS_TECNICOS = ["problema_tecnico", "revision_garantia", "soporte_tecnico", "otro"];

export async function cargarProblemasTecnicos(admin: SupabaseClient, personaId: string, fecha: string): Promise<ProblemasTecnicos> {
  const inicio = new Date(`${fecha}T00:00:00${LIMA}`).toISOString();
  const { data } = await admin
    .from("atenciones")
    .select("*, cuentas(razon_social)")
    .or(`tomada_por.eq.${personaId},and(tomada_por.is.null,asignado_a.eq.${personaId})`)
    .in("tipo", TIPOS_TECNICOS)
    .eq("es_prueba", false)
    .order("created_at")
    .limit(500);
  const fin = Date.parse(inicio) + 86_400_000;
  const hoy = Date.now();
  const lista = ((data ?? []) as unknown as (Atencion & { created_at: string; cuentas: { razon_social: string } | null })[]).filter(
    // Un cierre de un día posterior al del reporte no es «cerrado hoy».
    (a) => !a.cerrado_at || (Date.parse(a.cerrado_at) >= Date.parse(inicio) && Date.parse(a.cerrado_at) < fin),
  );

  const filas = lista.map((a) => {
    const cerrado = a.cerrado_at != null;
    const motivo = (a as { motivo_cierre?: string | null }).motivo_cierre;
    const falta = cerrado ? { texto: "Cerrado este día", responsable: "—", urgente: false } : queLeFalta(a);
    return {
      cliente: a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre",
      tipo: a.tipo === "problema_tecnico" ? null : tituloDelTipo(a.tipo, a.tipo_detalle),
      equipo: a.equipo_texto ?? null,
      etapa: cerrado ? "Cerrado" : (ETIQUETA_ETAPA[a.etapa as EtapaAtencion] ?? a.etapa),
      falta: falta.texto,
      motivo: cerrado ? (motivo ?? null) : null,
      leToca: falta.responsable,
      dias: Math.max(0, Math.floor((hoy - Date.parse(a.created_at)) / 86_400_000)),
      urgente: !cerrado && falta.urgente,
      cerradoHoy: cerrado,
    };
  });
  // Primero lo urgente y lo más antiguo; los cerrados del día, al final.
  filas.sort((x, y) => Number(x.cerradoHoy) - Number(y.cerradoHoy) || Number(y.urgente) - Number(x.urgente) || y.dias - x.dias);

  const conteo = new Map<string, number>();
  for (const f of filas) if (!f.cerradoHoy) conteo.set(f.etapa, (conteo.get(f.etapa) ?? 0) + 1);
  const orden = Object.values(ETIQUETA_ETAPA);
  const porEtapa = [...conteo.entries()]
    .sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0]))
    .map(([etapa, total]) => ({ etapa, total }));

  return {
    filas,
    porEtapa,
    abiertos: filas.filter((f) => !f.cerradoHoy).length,
    cerradosHoy: filas.filter((f) => f.cerradoHoy).length,
  };
}
