/**
 * TIEMPOS DE LOS FILES. Santos, 02-10-2026: medir «el tiempo en que Central se
 * demora en recibir y encontrar y dar el documento». Las horas de cada paso ya
 * se guardan (0334, 0350); acá se resumen.
 *
 * Todo se mide en HORARIO DE OFICINA, porque un pedido de las 5:50 pm que se
 * entrega a las 8:05 am no tardó 14 horas: tardó 15 minutos. Horario dado por
 * Santos el 02-10: lunes a viernes de 8:00 a 18:00 con almuerzo de 13:00 a
 * 14:00, y sábados de 9:00 a 12:00. Los feriados no se descuentan.
 */

/** [desde, hasta] en minutos desde la medianoche de Lima, por día (0 = domingo). */
const TRAMOS: Record<number, [number, number][]> = {
  0: [],
  1: [[8 * 60, 13 * 60], [14 * 60, 18 * 60]],
  2: [[8 * 60, 13 * 60], [14 * 60, 18 * 60]],
  3: [[8 * 60, 13 * 60], [14 * 60, 18 * 60]],
  4: [[8 * 60, 13 * 60], [14 * 60, 18 * 60]],
  5: [[8 * 60, 13 * 60], [14 * 60, 18 * 60]],
  6: [[9 * 60, 12 * 60]],
};

// Lima es UTC−5 todo el año (sin horario de verano).
const LIMA_MS = -5 * 60 * 60_000;
const DIA_MS = 24 * 60 * 60_000;

/** Minutos de oficina entre dos instantes (0 si `hasta` es anterior). */
export function minutosDeOficina(desde: Date | string, hasta: Date | string): number {
  const a = new Date(desde).getTime() + LIMA_MS;
  const b = new Date(hasta).getTime() + LIMA_MS;
  if (!(b > a)) return 0;
  let total = 0;
  // Se recorre día por día en «hora de Lima» corrida a UTC.
  for (let dia = Math.floor(a / DIA_MS) * DIA_MS; dia < b; dia += DIA_MS) {
    for (const [ini, fin] of TRAMOS[new Date(dia).getUTCDay()]) {
      const s = Math.max(a, dia + ini * 60_000);
      const e = Math.min(b, dia + fin * 60_000);
      if (e > s) total += e - s;
    }
  }
  return Math.round(total / 60_000);
}

/** «12 min», «2 h 05 min», «1 d 3 h» (un día de oficina = 9 h). */
export function duracionOficina(min: number): string {
  if (min < 60) return `${min} min`;
  const dias = Math.floor(min / 540);
  const resto = min - dias * 540;
  const h = Math.floor(resto / 60);
  const m = resto % 60;
  if (dias > 0) return `${dias} d${h ? ` ${h} h` : ""}`;
  return `${h} h${m ? ` ${String(m).padStart(2, "0")} min` : ""}`;
}

export type FilaTiempos = {
  id: string;
  solicitado_at: string;
  entregado_at: string | null;
  recibido_at: string | null;
  termine_at: string | null;
  devuelto_at: string | null;
  anulado_at: string | null;
  entrega_directa: boolean;
  cliente_texto: string | null;
  solicitante: { nombre: string; codigo_comercial: string | null } | null;
  entrego: { nombre: string } | null;
  recibio_vuelta: { nombre: string } | null;
};

export type Medida = {
  /** Casos ya cerrados en ese tramo. */
  n: number;
  mediana: number | null;
  promedio: number | null;
  maximo: number | null;
  /** Casos que siguen esperando ese paso, con cuánto llevan. */
  esperando: { id: string; cliente: string; quien: string; min: number }[];
  /** Mediana por persona responsable del paso. */
  porPersona: { nombre: string; n: number; mediana: number }[];
  /** Los más lentos ya cerrados. */
  lentos: { id: string; cliente: string; quien: string; min: number }[];
};

const mediana = (xs: number[]) => {
  if (xs.length === 0) return null;
  const o = [...xs].sort((x, y) => x - y);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
};

function medir(
  filas: FilaTiempos[],
  tramo: (f: FilaTiempos) => { desde: string | null; hasta: string | null; quien: string | null },
  ahora: Date,
): Medida {
  const cerrados: { f: FilaTiempos; min: number; quien: string }[] = [];
  const esperando: Medida["esperando"] = [];
  for (const f of filas) {
    const t = tramo(f);
    if (!t.desde) continue;
    const cliente = f.cliente_texto ?? "Cliente";
    if (t.hasta) cerrados.push({ f, min: minutosDeOficina(t.desde, t.hasta), quien: t.quien ?? "—" });
    else esperando.push({ id: f.id, cliente, quien: t.quien ?? "—", min: minutosDeOficina(t.desde, ahora) });
  }
  const mins = cerrados.map((c) => c.min);
  const grupos = new Map<string, number[]>();
  for (const c of cerrados) grupos.set(c.quien, [...(grupos.get(c.quien) ?? []), c.min]);
  return {
    n: cerrados.length,
    mediana: mediana(mins),
    promedio: mins.length ? Math.round(mins.reduce((s, x) => s + x, 0) / mins.length) : null,
    maximo: mins.length ? Math.max(...mins) : null,
    esperando: esperando.sort((x, y) => y.min - x.min),
    porPersona: [...grupos].map(([nombre, xs]) => ({ nombre, n: xs.length, mediana: mediana(xs)! })).sort((x, y) => y.mediana - x.mediana),
    lentos: cerrados
      .sort((x, y) => y.min - x.min)
      .slice(0, 3)
      .map((c) => ({ id: c.f.id, cliente: c.f.cliente_texto ?? "Cliente", quien: c.quien, min: c.min })),
  };
}

const persona = (p: FilaTiempos["solicitante"]) => (p ? `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}` : null);

/**
 * Los cuatro tramos del préstamo, de los pedidos de los últimos `dias` días
 * (sin anulados):
 *  - entregar: pedido → entregado (Central encuentra y entrega; sin las entregas directas).
 *  - firmar: entregado → «Recibí el file» (quien lo pidió).
 *  - recoger: «Terminé» → devuelto (Central pasa a recogerlo).
 *  - fuera: entregado → devuelto (cuánto pasa el file fuera del archivador).
 */
export function tiemposDeFiles(filas: FilaTiempos[], ahora: Date = new Date(), dias = 30) {
  const corte = ahora.getTime() - dias * DIA_MS;
  const vivas = filas.filter((f) => !f.anulado_at && new Date(f.solicitado_at).getTime() >= corte);
  return {
    total: vivas.length,
    entregar: medir(vivas.filter((f) => !f.entrega_directa), (f) => ({ desde: f.solicitado_at, hasta: f.entregado_at, quien: f.entrego?.nombre ?? (f.entregado_at ? null : persona(f.solicitante)) }), ahora),
    firmar: medir(vivas, (f) => ({ desde: f.entregado_at, hasta: f.recibido_at, quien: persona(f.solicitante) }), ahora),
    recoger: medir(vivas, (f) => ({ desde: f.termine_at, hasta: f.devuelto_at, quien: f.recibio_vuelta?.nombre ?? (f.devuelto_at ? null : persona(f.solicitante)) }), ahora),
    fuera: medir(vivas, (f) => ({ desde: f.entregado_at, hasta: f.devuelto_at, quien: persona(f.solicitante) }), ahora),
  };
}
