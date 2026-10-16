import type { SupabaseClient } from "@supabase/supabase-js";
import { ETIQUETA_ETAPA, queLeFalta, type Atencion, type EtapaAtencion } from "@/lib/atenciones";

/**
 * «PROBLEMAS TÉCNICOS Y SU ESTADO» en el reporte diario de postventa (Santos,
 * 16-10: «poner un apartado solo de problemas técnicos y su estado»). Los
 * casos de problema técnico asignados a la persona: los abiertos, con su paso,
 * lo que falta y a quién le toca, y los que cerró ese día. Es el estado al
 * generar el reporte. Llave de servicio: la ruta ya autorizó.
 */
export interface ProblemaTecnicoFila {
  cliente: string;
  equipo: string | null;
  etapa: string;
  falta: string;
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

export async function cargarProblemasTecnicos(admin: SupabaseClient, personaId: string, fecha: string): Promise<ProblemasTecnicos> {
  const inicio = new Date(`${fecha}T00:00:00${LIMA}`).toISOString();
  const { data } = await admin
    .from("atenciones")
    .select("*, cuentas(razon_social)")
    .eq("asignado_a", personaId)
    .eq("tipo", "problema_tecnico")
    .eq("es_prueba", false)
    .or(`cerrado_at.is.null,cerrado_at.gte.${inicio}`)
    .order("created_at")
    .limit(300);
  const fin = Date.parse(inicio) + 86_400_000;
  const hoy = Date.now();
  const lista = ((data ?? []) as unknown as (Atencion & { created_at: string; cuentas: { razon_social: string } | null })[]).filter(
    // Un cierre de un día posterior al del reporte no es «cerrado hoy».
    (a) => !a.cerrado_at || Date.parse(a.cerrado_at) < fin,
  );

  const filas = lista.map((a) => {
    const cerrado = a.cerrado_at != null;
    const falta = cerrado ? { texto: "Cerrado este día", responsable: "—", urgente: false } : queLeFalta(a);
    return {
      cliente: a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre",
      equipo: a.equipo_texto ?? null,
      etapa: cerrado ? "Cerrado" : (ETIQUETA_ETAPA[a.etapa as EtapaAtencion] ?? a.etapa),
      falta: falta.texto,
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
