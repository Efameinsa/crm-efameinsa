"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EtapaOportunidad } from "@/types/database";

const TIPOS_ACTIVIDAD = [
  "llamada",
  "whatsapp",
  "email",
  "visita",
  "showroom",
  "filtro",
  "nota",
  "otro",
] as const;

// R11: registrar una gestión debe tomar ≤15 s — un solo POST hace todo:
// guarda la actividad y actualiza la próxima acción de la oportunidad.
export async function registrarActividad(datos: {
  oportunidadId: string;
  tipo: (typeof TIPOS_ACTIVIDAD)[number];
  nota: string;
  resultadoId?: number | null;
  proximaAccion: string;
  proximaAccionAt: string | null;
}): Promise<{ error: string | null }> {
  if (!TIPOS_ACTIVIDAD.includes(datos.tipo)) {
    return { error: "Tipo de actividad inválido" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { error: errorActividad } = await supabase.from("actividades").insert({
    oportunidad_id: datos.oportunidadId,
    tipo: datos.tipo,
    nota: datos.nota || null,
    resultado_id: datos.resultadoId ?? null,
    realizada_por: user.id,
  });
  if (errorActividad) return { error: errorActividad.message };

  const { error: errorOportunidad } = await supabase
    .from("oportunidades")
    .update({
      proxima_accion: datos.proximaAccion || null,
      proxima_accion_at: datos.proximaAccionAt,
    })
    .eq("id", datos.oportunidadId);
  if (errorOportunidad) return { error: errorOportunidad.message };

  revalidatePath("/comercial");
  revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  return { error: null };
}

// Interés de compra (INT_COMPRA del Excel original), monto estimado y
// segmento — existían en el esquema desde B1 pero ninguna pantalla los
// editaba. Guardado optimista, sin botón "Guardar" aparte (mismo espíritu
// ≤15 s que el registro de actividad).
export async function calificarOportunidad(datos: {
  oportunidadId: string;
  intencion: "alto_potencial" | "medio_alto" | "medio" | "medio_bajo" | "bajo" | "sin_definir";
  montoEstimado: number | null;
  moneda: "PEN" | "USD";
  segmento: "industrial" | "semi_industrial" | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidades")
    .update({
      intencion: datos.intencion,
      monto_estimado: datos.montoEstimado,
      moneda: datos.moneda,
      segmento: datos.segmento,
    })
    .eq("id", datos.oportunidadId);
  if (error) return { error: error.message };

  revalidatePath("/comercial", "layout");
  revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  return { error: null };
}

const ETAPAS_MANUALES: EtapaOportunidad[] = [
  "asignada",
  "filtrada",
  "seguimiento",
  "potencial",
  "rechazada",
  "derivada",
];

// 'cotizada' y 'venta' no están acá: se alcanzan por el flujo de cotizador/venta
// (bloque B4), no por cambio manual de etapa.
export async function cambiarEtapa(datos: {
  oportunidadId: string;
  etapa: EtapaOportunidad;
  motivoRechazoId: number | null;
}): Promise<{ error: string | null }> {
  if (!ETAPAS_MANUALES.includes(datos.etapa)) {
    return { error: "Esa etapa no se cambia manualmente" };
  }
  if (datos.etapa === "rechazada" && !datos.motivoRechazoId) {
    return { error: "Seleccione el motivo del rechazo" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidades")
    .update({
      etapa: datos.etapa,
      motivo_rechazo_id: datos.etapa === "rechazada" ? datos.motivoRechazoId : null,
      cerrada_at: datos.etapa === "rechazada" ? new Date().toISOString() : null,
    })
    .eq("id", datos.oportunidadId);
  if (error) return { error: error.message };

  revalidatePath("/comercial");
  revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  return { error: null };
}
