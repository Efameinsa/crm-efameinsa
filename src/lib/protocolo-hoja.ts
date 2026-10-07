import { esTorre, seriesDeLaDescripcion } from "@/lib/torres";

/**
 * LA HOJA DE PROTOCOLO DE CADA MÁQUINA, COMO EL MODELO (0417; Ariana, 07-10).
 *
 * El Word de siempre («formato de protocolo Lavadora 507KWAT35592») es una
 * hoja por máquina: «INFORME DE PROTOCOLO DE PRUEBA DE LAVADORA 13 KG» y
 * «MODELO: CWG27MDCRS /405KWATM5344». Lo que el almacén no completó se propone
 * desde la descripción del cierre («LAVADORA – SECADORA … MODELO: GIANT C MAX
 * CAPACIDAD: 10 - 13 KG … SERIE: 405KWATM5344 SERIE: 303KWSB87694»).
 */
export type DatosHoja = {
  equipo?: string;
  modelo?: string;
  serie?: string;
  tecnico?: string;
  elaborado?: string;
  fecha_ejecucion?: string;
  fecha_informe?: string;
};

/** «principal» = la máquina del renglón; «secadora» = la de una torre sin renglón propio. */
export type Maquina = "principal" | "secadora";

const TIPOS = ["LAVADORA", "SECADORA", "CENTRIFUGA", "CENTRÍFUGA", "PLANCHADORA", "PLANCHADOR", "CALANDRA", "CALDERA", "ABLANDADOR", "COCHE"];

/** Qué máquina es, en mayúsculas: «LAVADORA», «SECADORA»… */
function tipoDe(descripcion: string, maquina: Maquina, parteNombre: string | null): string {
  const d = descripcion.toUpperCase();
  if (maquina === "secadora") return "SECADORA";
  if (parteNombre) return parteNombre.toUpperCase();
  if (esTorre(descripcion)) return "LAVADORA";
  const hallado = TIPOS.map((t) => ({ t, i: d.indexOf(t) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)[0];
  if (hallado) return hallado.t.replace("CENTRÍFUGA", "CENTRIFUGA");
  return d.split(/\s+(?:MARCA|MODELO)\b|[–,]/)[0].trim().slice(0, 50) || "EQUIPO";
}

/** La capacidad: «10 - 13 KG» en una torre es 13 la lavadora y 10 la secadora. */
function capacidadDe(descripcion: string, secadora: boolean): string | null {
  const d = descripcion.toUpperCase().replace(/,/g, ".");
  const rango = d.match(/(\d+(?:\.\d+)?)\s*(?:-|–|A|\/)\s*(\d+(?:\.\d+)?)\s*(KG|LB|BHP|HP)\b/);
  if (rango) {
    const [a, b] = [Number(rango[1]), Number(rango[2])];
    return `${secadora ? Math.min(a, b) : Math.max(a, b)} ${rango[3]}`;
  }
  const una = d.match(/(\d+(?:\.\d+)?)\s*(KG|LB|BHP)\b/);
  return una ? `${Number(una[1])} ${una[2]}` : null;
}

/** El modelo escrito en la descripción, hasta la siguiente etiqueta. */
export function modeloDeLaDescripcion(descripcion: string): string | null {
  const m = descripcion
    .toUpperCase()
    .match(/\bMODELO\s*:?\s*(.+?)(?=\s+(?:CAPACIDAD|SERIE|S\/N|MARCA|GAS|VOLTAJE|POTENCIA|\d+\s*V\b)|[\n,;]|$)/);
  return m ? m[1].trim().replace(/[.:-]+$/, "") || null : null;
}

/** Lo que se propone para la hoja cuando el almacén no lo escribió. */
export function propuestaDeHoja(
  e: { descripcion: string; serie: string | null; parte_nombre: string | null },
  maquina: Maquina,
): Required<Pick<DatosHoja, "equipo">> & Pick<DatosHoja, "modelo" | "serie"> {
  const parte = e.parte_nombre ?? null;
  const secadora = maquina === "secadora" || /SECADORA/i.test(parte ?? "");
  const tipo = tipoDe(e.descripcion, maquina, parte);
  const capacidad = capacidadDe(e.descripcion, secadora);
  const enTexto = seriesDeLaDescripcion(e.descripcion);
  const juntas = (e.serie ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  const serie = maquina === "secadora" ? (juntas[1] ?? enTexto[1] ?? undefined) : (juntas[0] ?? enTexto[0] ?? undefined);
  return {
    equipo: capacidad ? `${tipo} ${capacidad}` : tipo,
    modelo: modeloDeLaDescripcion(e.descripcion) ?? undefined,
    serie,
  };
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «Miércoles 01 julio del 2026», como la fecha arriba a la derecha del Word. */
export function fechaLarga(dia: string): string {
  const [a, m, d] = dia.slice(0, 10).split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d, 12));
  return `${DIAS[f.getUTCDay()]} ${String(d).padStart(2, "0")} ${MESES[m - 1]} del ${a}`;
}

/** «2026-07-01» → «01/07/2026». */
export const fechaCorta = (dia: string | null | undefined) => (dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : null);
