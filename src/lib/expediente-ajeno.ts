import type { createClient } from "@/lib/supabase/server";

/**
 * EL EXPEDIENTE ES DE OTRO: DECIRLO IGUAL EN TODAS LAS PUERTAS.
 *
 * En el CRM una gestión la anota el dueño del expediente y un caso lo cierra
 * su dueño (políticas `actividades_insert` y `oportunidades_comercial_update`).
 * Es la regla correcta —así se sabe quién atendió— pero tiene tres puertas:
 * «Registrar gestión», «Caso atendido» y el propio botón de cerrar. Cada una
 * fallaba distinto: una devolvía el mensaje de Postgres en inglés («new row
 * violates row-level security policy»), y otra no devolvía NADA —un `update`
 * que la RLS no deja tocar no da error, simplemente no cambia ninguna fila, y
 * la pantalla decía «listo» sin que nada hubiera pasado—.
 *
 * Postventa leyó eso como que el CRM estaba roto: «no puedo registrar la
 * gestión que se envió una cotización» (09-09). Podía —en SUS expedientes— y
 * estaba parada en el de Ariana. Acá se arma el mismo mensaje para todas, y el
 * mensaje dice qué hacer: el expediente se pide, con código (0202).
 */

/** Quién tiene hoy el expediente, escrito como se lee en pantalla: «C4 · Ariana Flores». */
export async function duenoDelExpediente(
  supabase: Awaited<ReturnType<typeof createClient>>,
  oportunidadId: string,
): Promise<string> {
  const { data } = await supabase
    .from("oportunidades")
    .select("perfiles(nombre, codigo_comercial)")
    .eq("id", oportunidadId)
    .maybeSingle();
  const p = data?.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  if (!p) return "otra persona";
  return `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}`;
}

export function mensajeExpedienteAjeno(quien: string): string {
  return `Este expediente es de ${quien}, por eso no la deja anotar acá. Ábralo y use «Pedir el expediente» —le hace falta el código del supervisor—, o anote en el expediente suyo de este mismo cliente.`;
}

/** ¿El error que devolvió Postgres es la RLS diciendo «esto no es suyo»? */
export function esRechazoDeRls(mensaje: string): boolean {
  return /row-level security|violates row-level/i.test(mensaje);
}
