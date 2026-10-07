import type { SupabaseClient } from "@supabase/supabase-js";
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
  const [{ data: deInformes }, { data: deAtenciones }, { data: oficiales }] = await Promise.all([
    supabase.from("informes_servicio").select("tecnico").not("tecnico", "is", null).limit(500),
    supabase.from("atenciones").select("tecnico").not("tecnico", "is", null).limit(500),
    supabase.from("tecnicos").select("nombre, dni").eq("activo", true).order("orden"),
  ]);
  const relacion = (oficiales ?? []) as TecnicoConDni[];

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

  // Primero la relación de técnicos de la empresa (0410), escrita como allí;
  // después los demás que firmaron algo (terceros), sin repetir a los de la lista.
  const otros = [...cuenta.values()]
    .filter((t) => !relacion.some((r) => mismoTecnico(r.nombre, t.nombre)))
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, "es-PE"))
    .map((t) => t.nombre);
  return [...relacion.map((r) => r.nombre), ...otros].slice(0, 25);
}

export interface TecnicoConDni {
  nombre: string;
  dni: string | null;
}

const normal = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/h/gi, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * ¿Es la misma persona? Mismo apellido y el nombre que empieza igual:
 * «Cristian Dolorier» es «Cristhian Dolorier», y «C. Dolorier» también.
 * Sin la hache, que es la que más se olvida (Cristhian, Jhon).
 */
export function mismoTecnico(a: string, b: string): boolean {
  const x = normal(a).split(" ").filter(Boolean);
  const y = normal(b).split(" ").filter(Boolean);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  if (x.length < 2 || y.length < 2) return false;
  // El apellido de la relación tiene que estar en lo escrito, y el nombre empezar igual.
  const apellidoX = x[x.length - 1];
  const apellidoY = y[y.length - 1];
  const nombreX = x[0];
  const nombreY = y[0];
  const n = Math.min(nombreX.length, nombreY.length, 3);
  return apellidoX === apellidoY && nombreX.slice(0, n) === nombreY.slice(0, n);
}

/**
 * EL TÉCNICO CON SU DNI, como va impreso en la apertura (relación de técnicos
 * de Lesly, 06-10): el cliente lo pide para dejarlo entrar a planta. Si van
 * dos («Danny Solis / Nilton Monago»), cada uno en su línea con el suyo. Un
 * tercero que no está en la relación sale tal cual, sin inventarle nada.
 */
export function conDni(texto: string | null | undefined, relacion: TecnicoConDni[]): string | null {
  const t = texto?.trim();
  if (!t) return null;
  const partes = t.split(/\s*(?:\/|,|;|\+|\s+y\s+|\n)\s*/i).filter(Boolean);
  return partes
    .map((p) => {
      const r = relacion.find((x) => mismoTecnico(x.nombre, p));
      return r?.dni ? `${r.nombre.toUpperCase()} — DNI ${r.dni}` : p;
    })
    .join("\n");
}

/** La relación de técnicos de la empresa (0410). */
export async function relacionDeTecnicos(supabase: SupabaseClient): Promise<TecnicoConDni[]> {
  const { data } = await supabase.from("tecnicos").select("nombre, dni").eq("activo", true).order("orden");
  return (data ?? []) as TecnicoConDni[];
}
