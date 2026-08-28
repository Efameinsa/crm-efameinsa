"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/acciones/oportunidades";

/**
 * La gestión de un clic de la ruta de mantenimiento.
 *
 * Regla 11 del proyecto: registrar una gestión debe tomar ≤15 segundos. En una
 * campaña de llamadas eso significa no abrir la ficha: Ariana marca, escucha y
 * pulsa uno de tres botones sin salir de la lista. Son los tres desenlaces que
 * tiene de verdad una llamada de mantenimiento —no contesta, quiere cotización,
 * no por ahora—; cualquier cosa más matizada se escribe en la ficha, que sigue
 * a un clic de distancia.
 *
 * NO INVENTA TAXONOMÍA. Cada botón es un resultado del catálogo oficial que
 * gerencia ya confirmó (docs/08), buscado por su código y no por su id: la
 * acción sugerida y los días de recontacto salen de ahí, así que si mañana
 * gerencia decide que «no contestó» se reintenta a los dos días, cambia en el
 * catálogo y esta pantalla obedece sin tocar código.
 *
 * Y NO DUPLICA `registrarActividad`. Escribir la actividad y mover la próxima
 * acción es una sola operación con reglas finas —la de no borrar una próxima
 * acción ya agendada costó una prueba fallida el 23-08— y se llama, no se
 * copia. Misma lección que crear/editar_cotizacion.
 */

const BOTONES = {
  no_contesta: {
    codigo: "NO_CONTESTO",
    nota: "Llamé por el mantenimiento: no contesta.",
    accionPorDefecto: "Volver a intentar contacto",
    diasPorDefecto: 1,
  },
  interesado: {
    codigo: "PIDIO_COTIZACION",
    nota: "Interesado en el mantenimiento: pide cotización.",
    accionPorDefecto: "Enviar la cotización",
    diasPorDefecto: 1,
  },
  no_por_ahora: {
    codigo: "COMPRA_FUTURO",
    nota: "No por ahora. Queda para retomar más adelante.",
    accionPorDefecto: "Retomar el contacto",
    diasPorDefecto: 30,
  },
} as const;

export type BotonRuta = keyof typeof BOTONES;

function enDias(dias: number): string {
  // Se cuenta desde hoy en Lima, no desde el reloj del servidor: en Vercel es
  // UTC y de noche adelantaría la agenda un día entero.
  const hoyLima = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const d = new Date(`${hoyLima}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("en-CA");
}

export async function gestionRapidaRuta(datos: {
  oportunidadId: string;
  boton: BotonRuta;
  /** Lo que dijo el cliente, si alcanzó a escribirlo. Opcional a propósito. */
  detalle?: string;
}): Promise<{ error: string | null }> {
  const config = BOTONES[datos.boton];
  if (!config) return { error: "Ese botón no existe" };

  const supabase = await createClient();
  const { data: resultado } = await supabase
    .from("catalogo_resultados_gestion")
    .select("id, accion_sugerida, dias_sugeridos")
    .eq("codigo", config.codigo)
    .maybeSingle();

  const detalle = (datos.detalle ?? "").trim();

  return registrarActividad({
    oportunidadId: datos.oportunidadId,
    tipo: "llamada",
    nota: detalle ? `${config.nota} ${detalle}` : config.nota,
    resultadoId: resultado?.id ?? null,
    proximaAccion: resultado?.accion_sugerida ?? config.accionPorDefecto,
    proximaAccionAt: enDias(resultado?.dias_sugeridos ?? config.diasPorDefecto),
  }).then((r) => {
    if (!r.error) revalidatePath("/comercial/ruta");
    return r;
  });
}
