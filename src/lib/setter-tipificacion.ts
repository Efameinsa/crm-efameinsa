import { createAdminClient } from "@/lib/supabase/admin";
import { notificarLeadEntrante } from "@/lib/notificaciones";
import { repartirFormularioMeta } from "@/lib/meta-formularios";

/**
 * LA TIPIFICACIÓN DEL SETTER (Santos, 20-10-2026).
 *
 * «Luego de mí lo paso a cada vendedor… la apk debe estar configurada para poder tipificar
 * rápido, para los informes: no contesta, no tiene dinero, equivocado, muy interesado,
 * interesado, medio».
 *
 * Al colgar, la app del setter muestra estos botones y manda UNO. Según cuál sea, el CRM:
 *  · «pasa»: reparte el lead al comercial dueño de la campaña (o a Central si no tiene),
 *    con el nivel de interés ya puesto y la nota del setter en el expediente;
 *  · «cierra»: deja el expediente rechazado con el motivo del catálogo (así cuenta en los
 *    informes de la campaña) sin molestar al comercial;
 *  · «reintento»: el lead sigue esperando; la llamada vuelve a la cola más tarde.
 *
 * Los niveles son los de siempre del CRM (`intencion_compra`); el setter no inventa otros.
 */

export type Resultado =
  | "muy_interesado"
  | "interesado"
  | "poco_interesado"
  | "financiamiento"
  | "sin_dinero"
  | "equivocado"
  | "domestico"
  | "no_interesa"
  | "no_contesto"
  | "llamar_despues";

export interface DefResultado {
  etiqueta: string;
  tipo: "pasa" | "cierra" | "reintento";
  intencion?: "alto_potencial" | "medio_alto" | "medio" | "medio_bajo" | "bajo" | "no_responde";
  /** Motivo del catálogo de rechazo (`catalogo_motivos_rechazo`). */
  motivo?: number;
}

export const RESULTADOS: Record<Resultado, DefResultado> = {
  muy_interesado: { etiqueta: "Muy interesado", tipo: "pasa", intencion: "medio_alto" },
  interesado: { etiqueta: "Interesado", tipo: "pasa", intencion: "medio" },
  poco_interesado: { etiqueta: "Poco interesado", tipo: "pasa", intencion: "bajo" },
  financiamiento: { etiqueta: "Busca financiamiento", tipo: "pasa", intencion: "medio_bajo" },
  sin_dinero: { etiqueta: "No tiene dinero", tipo: "cierra", motivo: 2 }, // Precio fuera de presupuesto
  equivocado: { etiqueta: "Número o datos equivocados", tipo: "cierra", motivo: 8 }, // Datos falsos / spam
  domestico: { etiqueta: "Busca equipo doméstico", tipo: "cierra", motivo: 2525 },
  no_interesa: { etiqueta: "No le interesa", tipo: "cierra", motivo: 5 }, // Solo consultaba / sin intención
  no_contesto: { etiqueta: "No contestó", tipo: "reintento" },
  llamar_despues: { etiqueta: "Pidió que lo llamen después", tipo: "reintento" },
};

export function esResultado(v: unknown): v is Resultado {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(RESULTADOS, v);
}

/** Intentos totales antes de pasar al comercial como «no responde». */
const INTENTOS_MAX = 3;

/** Lima es UTC-5 todo el año. Devuelve la hora local (0-23) y mueve a la ventana 8:00-19:00. */
export function proximoIntento(ahora: Date, despuesDeHoras: number): Date {
  const d = new Date(ahora.getTime() + despuesDeHoras * 3_600_000);
  const lima = new Date(d.getTime() - 5 * 3_600_000);
  const h = lima.getUTCHours();
  if (h >= 8 && h < 19) return d;
  const dia = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() + (h >= 19 ? 1 : 0), 9, 0, 0));
  return new Date(dia.getTime() + 5 * 3_600_000);
}

export interface SalidaTipificar {
  ok: boolean;
  error?: "no_existe" | "datos";
  ya?: boolean;
  /** Para «no contestó» y «llamar después»: cuándo vuelve a salir la llamada. */
  vuelveA?: string;
  /** Qué pasó con el lead, para mostrárselo a la persona. */
  destino?: "comercial" | "central" | "cerrado" | "espera" | "sin_cambio";
}

export async function reclamar(leadId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("llamadas_por_hacer").update({ retiene: false }).eq("lead_id", leadId).eq("retiene", true).select("id");
  return Boolean(data?.length);
}

/** El setter eligió un resultado para la llamada `id` (de `llamadas_por_hacer`). Idempotente. */
export async function tipificarLlamada(datos: {
  id: string;
  userId: string;
  resultado: Resultado;
  nota?: string | null;
  duracionS?: number | null;
}): Promise<SalidaTipificar> {
  const admin = createAdminClient();
  const { data: fila } = await admin
    .from("llamadas_por_hacer")
    .select("id, lead_id, nombre, telefono, detalle, retiene, intento, tipificada_at, estado")
    .eq("id", datos.id)
    .eq("user_id", datos.userId)
    .maybeSingle();
  if (!fila) return { ok: false, error: "no_existe" };
  if (fila.tipificada_at) return { ok: true, ya: true };

  const def = RESULTADOS[datos.resultado];
  const nota = datos.nota?.trim().slice(0, 500) || null;
  const ahora = new Date();
  const { error: eFila } = await admin
    .from("llamadas_por_hacer")
    .update({
      resultado: datos.resultado,
      nota,
      tipificada_at: ahora.toISOString(),
      duracion_s: datos.duracionS != null && datos.duracionS >= 0 ? Math.floor(datos.duracionS) : null,
      estado: fila.estado === "avisada" || fila.estado === "pendiente" ? "llamada" : fila.estado,
      cerrada_at: ahora.toISOString(),
    })
    .eq("id", fila.id)
    .is("tipificada_at", null);
  if (eFila) return { ok: false, error: "datos" };

  const leadId = fila.lead_id as string | null;

  if (def.tipo === "reintento") {
    const contados = datos.resultado === "no_contesto";
    let intento = fila.intento as number;
    if (contados) {
      const { count } = await admin
        .from("llamadas_por_hacer")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId ?? "")
        .eq("resultado", "no_contesto");
      intento = Math.max(count ?? 0, intento);
      if (intento >= INTENTOS_MAX) {
        // Tres intentos sin respuesta: pasa al comercial, calificado «no responde».
        if (!leadId) return { ok: true, destino: "sin_cambio" };
        const destino = await entregarLeadDelSetter(leadId, {
          resultado: "no_contesto",
          intencion: "no_responde",
          nota: `No contestó tras ${intento} intentos.${nota ? ` ${nota}` : ""}`,
          userId: datos.userId,
          reclamar: Boolean(fila.retiene),
        });
        return { ok: true, destino };
      }
    }
    const cuando = proximoIntento(ahora, contados ? (intento <= 1 ? 2 : 20) : 1);
    if (leadId) {
      await admin.from("llamadas_por_hacer").insert({
        user_id: datos.userId,
        lead_id: leadId,
        nombre: fila.nombre,
        telefono: fila.telefono,
        detalle: fila.detalle,
        retiene: Boolean(fila.retiene),
        intento: intento + 1,
        disponible_desde: cuando.toISOString(),
      });
    }
    return { ok: true, vuelveA: cuando.toISOString(), destino: "espera" };
  }

  if (!leadId) return { ok: true, destino: "sin_cambio" };
  const destino = await entregarLeadDelSetter(leadId, { resultado: datos.resultado, nota: nota ?? undefined, userId: datos.userId, reclamar: Boolean(fila.retiene) });
  return { ok: true, destino };
}

/**
 * Lo que pasa con el lead cuando el setter terminó con él (o cuando no llegó a tipificarlo).
 * Si el lead ya había salido de la bandeja (se repartió por la red de seguridad), el resultado
 * se anota en su expediente sin volver a repartirlo.
 */
export async function entregarLeadDelSetter(
  leadId: string,
  o: { resultado: Resultado | null; nota?: string; intencion?: DefResultado["intencion"]; userId?: string; reclamar?: boolean },
): Promise<SalidaTipificar["destino"]> {
  const admin = createAdminClient();
  if (o.reclamar !== false) await reclamar(leadId);
  const { data: lead } = await admin
    .from("leads")
    .select("id, codigo, estado, nombre_contacto, razon_social, oportunidad_id, mensaje")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return "sin_cambio";

  const def = o.resultado ? RESULTADOS[o.resultado] : null;
  const cierra = def?.tipo === "cierra";
  const etiqueta = o.intencion === "no_responde" ? "No contestó" : def?.etiqueta ?? null;
  const resumen = [etiqueta ? `Setter: ${etiqueta}.` : null, o.nota ?? null].filter(Boolean).join(" ").trim();
  const quien = [lead.nombre_contacto || "Sin nombre", lead.razon_social, etiqueta ? `Setter: ${etiqueta}` : null].filter(Boolean).join(" · ");

  let oportunidadId = (lead.oportunidad_id as string | null) ?? null;
  let destino: SalidaTipificar["destino"] = "sin_cambio";

  if (lead.estado === "pendiente_triaje") {
    if (cierra) {
      // No pasa: se asigna en silencio (para que cuente en la campaña y en el informe) y se cierra.
      const { data } = await admin.rpc("asignar_lead_desde_formulario", { p_lead_id: leadId });
      const r = (data ?? null) as { resultado?: string; oportunidad_id?: string } | null;
      if (r?.resultado === "asignado" && r.oportunidad_id) {
        oportunidadId = r.oportunidad_id;
        destino = "cerrado";
      } else if (r?.resultado === "central") {
        // Sin comercial dueño: no hay expediente donde cerrarlo; sale de la bandeja de Central.
        await admin
          .from("leads")
          .update({ estado: "descartado", mensaje: [lead.mensaje, resumen].filter(Boolean).join(" · ") })
          .eq("id", leadId)
          .eq("estado", "pendiente_triaje");
        return "cerrado";
      } else {
        await notificarLeadEntrante({ titulo: "Contacto de Meta por revisar (el setter lo cerró)", cuerpo: `${quien} · ${lead.codigo}` });
        return "central";
      }
    } else {
      const r = await repartirFormularioMeta(leadId, { codigo: lead.codigo as string, quien });
      if (r?.resultado === "asignado" && r.oportunidad_id) {
        oportunidadId = r.oportunidad_id;
        destino = "comercial";
      } else {
        if (resumen) {
          await admin
            .from("leads")
            .update({ mensaje: [lead.mensaje, resumen].filter(Boolean).join(" · ") })
            .eq("id", leadId)
            .eq("estado", "pendiente_triaje");
        }
        return "central";
      }
    }
  } else if (oportunidadId) {
    destino = cierra ? "cerrado" : "comercial";
  }

  if (!oportunidadId) return destino;

  if (resumen) {
    await admin.from("actividades").insert({ oportunidad_id: oportunidadId, tipo: "llamada", nota: resumen, realizada_por: o.userId ?? null, adjuntos: [] });
  }
  const { data: op } = await admin.from("oportunidades").select("etapa, intencion").eq("id", oportunidadId).maybeSingle();
  if (!op) return destino;
  if (cierra && def?.motivo && ["asignada", "filtrada"].includes(op.etapa as string)) {
    await admin
      .from("oportunidades")
      .update({ etapa: "rechazada", motivo_rechazo_id: def.motivo, cerrada_at: new Date().toISOString() })
      .eq("id", oportunidadId);
  } else if (!cierra && (def?.intencion || o.intencion) && op.intencion === "sin_definir") {
    await admin
      .from("oportunidades")
      .update({ intencion: o.intencion ?? def?.intencion })
      .eq("id", oportunidadId);
  }
  return destino;
}
