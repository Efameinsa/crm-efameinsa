import type { createClient } from "@/lib/supabase/server";

/**
 * LOS TÉCNICOS QUE EL SISTEMA YA CONOCE.
 *
 * El campo «qué técnico va» era texto libre y en blanco, mientras la pestaña
 * Histórico demostraba que el CRM ya sabe quiénes son —Yony Capulian, Marco
 * Aliaga, Ruben Ccopa— porque firman los informes de servicio (informe de UX
 * del 08-09). Escribirlo a mano cada vez es cómo se llega a «Marco Aliaga»,
 * «M. Aliaga» y «marco aliaga» siendo la misma persona, y entonces ningún
 * reporte por técnico cuadra.
 *
 * SIGUE SIENDO TEXTO LIBRE, a propósito: el área contrata terceros para una
 * visita puntual y una lista cerrada obligaría a darlos de alta antes de poder
 * agendar. Lo que se agrega es la sugerencia; escribir un nombre nuevo se
 * puede, y desde la próxima vez ya aparece solo.
 */
export async function tecnicosConocidos(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const [{ data: deInformes }, { data: deAtenciones }] = await Promise.all([
    supabase.from("informes_servicio").select("tecnico").not("tecnico", "is", null).limit(500),
    supabase.from("atenciones").select("tecnico").not("tecnico", "is", null).limit(500),
  ]);

  // Se agrupa sin distinguir mayúsculas ni espacios de más, y gana la forma
  // más frecuente: si el nombre está escrito de tres maneras, la lista ofrece
  // la que el área usa de verdad.
  const cuenta = new Map<string, { nombre: string; veces: number }>();
  for (const f of [...(deInformes ?? []), ...(deAtenciones ?? [])]) {
    const nombre = String(f.tecnico ?? "").replace(/\s+/g, " ").trim();
    if (nombre.length < 3) continue;
    const clave = nombre.toLocaleLowerCase("es-PE");
    const previo = cuenta.get(clave);
    if (previo) previo.veces += 1;
    else cuenta.set(clave, { nombre, veces: 1 });
  }

  return [...cuenta.values()]
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, "es-PE"))
    .slice(0, 20)
    .map((t) => t.nombre);
}
