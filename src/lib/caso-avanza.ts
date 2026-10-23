import type { createClient } from "@/lib/supabase/server";
import { ETAPAS_ATENCION, type EtapaAtencion } from "@/lib/atenciones";

type Cliente = Awaited<ReturnType<typeof createClient>>;

/**
 * EL CASO AVANZA CON LO QUE SE EJECUTA (rediseño de postventa, 23-10).
 *
 * El CASO-00019 de Inversiones Turísticas Centenario llevaba 46 días en
 * «Registro» aunque el 07-09 se coordinó una videollamada y el 23-10 se derivó
 * otra al almacén: la etapa del caso solo se movía si alguien entraba al caso
 * y apretaba «programar». 97 casos del área estaban así, tomados y quietos.
 *
 * Regla: derivar una llamada al almacén o emitir una apertura de servicio ES
 * planificar la atención → el caso pasa a «Planificación» (si estaba antes);
 * el informe del almacén ES la atención hecha → pasa a «Atención» (si estaba
 * antes). Nunca retrocede, nunca salta lo que ya pasó, y deja escrito por qué
 * se saltaron los antecedentes, como hace `programarAtencion`.
 */
export async function avanzarCasoAlEjecutar(
  supabase: Cliente,
  atencionId: string | null | undefined,
  hasta: Extract<EtapaAtencion, "planificacion" | "atencion">,
  motivo: string,
  programadaPara?: string | null,
): Promise<void> {
  if (!atencionId) return;
  const { data: caso } = await supabase.from("atenciones").select("etapa, programada_at, etapas_omitidas, cerrado_at").eq("id", atencionId).maybeSingle();
  if (!caso || caso.cerrado_at) return;
  const de = ETAPAS_ATENCION.indexOf(caso.etapa as EtapaAtencion);
  const a = ETAPAS_ATENCION.indexOf(hasta);
  if (de < 0 || de >= a) return;
  const omitidas = { ...((caso.etapas_omitidas as Record<string, unknown> | null) ?? {}) };
  // Lo que queda entre medio se anota como saltado por esta ejecución.
  for (let i = de + 1; i < a; i++) {
    const e = ETAPAS_ATENCION[i];
    if (!(e in omitidas)) omitidas[e] = { motivo, at: new Date().toISOString() };
  }
  // «Registro» y «Solicitud» no se saltan: se cumplen al tomar el caso; igual quedan atrás.
  await supabase
    .from("atenciones")
    .update({
      etapa: hasta,
      etapas_omitidas: omitidas,
      ...(programadaPara && !caso.programada_at ? { programada_at: programadaPara } : {}),
      ...(hasta === "atencion" ? { atendido_at: new Date().toISOString() } : {}),
    })
    .eq("id", atencionId)
    .is("cerrado_at", null);
}
